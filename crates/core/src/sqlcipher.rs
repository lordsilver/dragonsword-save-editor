//! SQLCipher v4 reader/writer for DragonSword Awakening saves.
//!
//! The game uses `PRAGMA cipher_compatibility = 4`: AES-256-CBC with 4096-byte
//! pages, PBKDF2-HMAC-SHA512 (256000 iterations), and a per-page HMAC-SHA512.
//! Page 1 stores a random salt where SQLite normally stores its magic header.
//! The passphrase is a single constant shared by every save, derived by hashing
//! a string embedded in the client with FNV-1a-64 over UTF-16 code units.

use aes::Aes256;
use aes::cipher::block_padding::NoPadding;
use aes::cipher::generic_array::GenericArray;
use aes::cipher::{BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use cbc::{Decryptor, Encryptor};
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha512;
use subtle::ConstantTimeEq;

use crate::error::{Error, Result};

const PAGE_SIZE: usize = 4096;
const SALT_SIZE: usize = 16;
const IV_SIZE: usize = 16;
const HMAC_SIZE: usize = 64;
const KEY_SIZE: usize = 32;
const KDF_ITER: u32 = 256_000;
const FAST_KDF_ITER: u32 = 2;
const HMAC_SALT_MASK: u8 = 0x3a;
const RESERVE: usize = IV_SIZE + HMAC_SIZE;
const SQLITE_MAGIC: &[u8; 16] = b"SQLite format 3\0";

const KEY_SEED: &str = "x'1f86483d109b44e81d31181f14b2bba014cf8a174b4fa7f3fe666f075c2ae6c0'";

/// The SQLCipher key shared by every DragonSword Awakening save.
pub const PASSPHRASE: &str = "13314374259236352028";

/// Recompute the passphrase from the client's embedded seed. Always equals
/// [`PASSPHRASE`]; keeping the derivation here documents where the key comes
/// from and guards against a typo in the constant.
pub fn derive_passphrase() -> String {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x100_0000_01b3;
    let mut hash = OFFSET;
    for unit in KEY_SEED.encode_utf16() {
        hash = (hash ^ u64::from(unit)).wrapping_mul(PRIME);
    }
    hash.to_string()
}

fn derive_keys(passphrase: &str, salt: &[u8]) -> ([u8; KEY_SIZE], [u8; KEY_SIZE]) {
    let mut enc_key = [0u8; KEY_SIZE];
    pbkdf2_hmac::<Sha512>(passphrase.as_bytes(), salt, KDF_ITER, &mut enc_key);

    let mut hmac_salt = [0u8; SALT_SIZE];
    for (dst, src) in hmac_salt.iter_mut().zip(salt) {
        *dst = src ^ HMAC_SALT_MASK;
    }
    let mut hmac_key = [0u8; KEY_SIZE];
    pbkdf2_hmac::<Sha512>(&enc_key, &hmac_salt, FAST_KDF_ITER, &mut hmac_key);
    (enc_key, hmac_key)
}

fn page_hmac(hmac_key: &[u8], cipher_text: &[u8], iv: &[u8], page_number: u32) -> [u8; HMAC_SIZE] {
    let mut mac =
        <Hmac<Sha512> as Mac>::new_from_slice(hmac_key).expect("HMAC accepts any key length");
    mac.update(cipher_text);
    mac.update(iv);
    mac.update(&page_number.to_le_bytes());
    let digest = mac.finalize().into_bytes();
    let mut out = [0u8; HMAC_SIZE];
    out.copy_from_slice(&digest);
    out
}

/// The 16-byte salt stored at the start of a SQLCipher file.
pub fn salt(encrypted: &[u8]) -> Result<[u8; SALT_SIZE]> {
    if encrypted.len() < SALT_SIZE {
        return Err(Error::Crypto(
            "save file is too small to be a SQLCipher database".into(),
        ));
    }
    let mut out = [0u8; SALT_SIZE];
    out.copy_from_slice(&encrypted[..SALT_SIZE]);
    Ok(out)
}

/// Decrypt a SQLCipher v4 database into a plain SQLite database. Every page
/// keeps its 80 reserved bytes, and page 1 gets the standard SQLite header.
pub fn decrypt(encrypted: &[u8], passphrase: &str) -> Result<Vec<u8>> {
    if encrypted.is_empty() || !encrypted.len().is_multiple_of(PAGE_SIZE) {
        return Err(Error::Crypto(format!(
            "save size {} is not a multiple of the {} byte page size",
            encrypted.len(),
            PAGE_SIZE
        )));
    }
    let salt = salt(encrypted)?;
    let (enc_key, hmac_key) = derive_keys(passphrase, &salt);
    decrypt_with_keys(encrypted, &enc_key, &hmac_key)
}

fn decrypt_with_keys(
    encrypted: &[u8],
    enc_key: &[u8; KEY_SIZE],
    hmac_key: &[u8; KEY_SIZE],
) -> Result<Vec<u8>> {
    let pages = encrypted.len() / PAGE_SIZE;
    let reserve_start = PAGE_SIZE - RESERVE;
    let mut out = vec![0u8; encrypted.len()];

    for page_index in 0..pages {
        let page_number = (page_index + 1) as u32;
        let page = &encrypted[page_index * PAGE_SIZE..(page_index + 1) * PAGE_SIZE];
        let enc_start = if page_index == 0 { SALT_SIZE } else { 0 };
        let cipher_text = &page[enc_start..reserve_start];
        let iv = &page[reserve_start..reserve_start + IV_SIZE];
        let stored_mac = &page[reserve_start + IV_SIZE..reserve_start + IV_SIZE + HMAC_SIZE];

        let computed = page_hmac(hmac_key, cipher_text, iv, page_number);
        if !bool::from(stored_mac.ct_eq(&computed)) {
            return Err(Error::Crypto(format!(
                "page {page_number} failed its integrity check (wrong key or corrupt file)"
            )));
        }

        let mut plain = cipher_text.to_vec();
        let dec = Decryptor::<Aes256>::new(
            GenericArray::from_slice(enc_key),
            GenericArray::from_slice(iv),
        );
        let plain = dec
            .decrypt_padded_mut::<NoPadding>(&mut plain)
            .map_err(|_| Error::Crypto(format!("page {page_number} could not be decrypted")))?;

        let dst = &mut out[page_index * PAGE_SIZE..(page_index + 1) * PAGE_SIZE];
        if page_index == 0 {
            dst[..SALT_SIZE].copy_from_slice(SQLITE_MAGIC);
            dst[SALT_SIZE..SALT_SIZE + plain.len()].copy_from_slice(plain);
        } else {
            dst[..plain.len()].copy_from_slice(plain);
        }
    }
    Ok(out)
}

/// Encrypt a plain SQLite database back into SQLCipher v4, reusing the original
/// salt so the game derives the same key. A fresh random IV is used per page.
pub fn encrypt(plain: &[u8], passphrase: &str, salt: &[u8; SALT_SIZE]) -> Result<Vec<u8>> {
    if plain.is_empty() || !plain.len().is_multiple_of(PAGE_SIZE) {
        return Err(Error::Crypto(format!(
            "database size {} is not a multiple of the {} byte page size",
            plain.len(),
            PAGE_SIZE
        )));
    }
    let (enc_key, hmac_key) = derive_keys(passphrase, salt);
    encrypt_with_keys(plain, &enc_key, &hmac_key, salt)
}

/// Encrypt and immediately decrypt with the same keys. The write path uses this
/// so a cipher or page-layout bug cannot replace the only copy of a save.
pub fn encrypt_verified(plain: &[u8], passphrase: &str, salt: &[u8; SALT_SIZE]) -> Result<Vec<u8>> {
    if plain.is_empty() || !plain.len().is_multiple_of(PAGE_SIZE) {
        return Err(Error::Crypto(format!(
            "database size {} is not a multiple of the {} byte page size",
            plain.len(),
            PAGE_SIZE
        )));
    }
    let (enc_key, hmac_key) = derive_keys(passphrase, salt);
    let encrypted = encrypt_with_keys(plain, &enc_key, &hmac_key, salt)?;
    let decrypted = decrypt_with_keys(&encrypted, &enc_key, &hmac_key)?;
    if decrypted != plain {
        return Err(Error::Crypto(
            "re-encrypted save did not match the edited database".into(),
        ));
    }
    Ok(encrypted)
}

fn encrypt_with_keys(
    plain: &[u8],
    enc_key: &[u8; KEY_SIZE],
    hmac_key: &[u8; KEY_SIZE],
    salt: &[u8; SALT_SIZE],
) -> Result<Vec<u8>> {
    let pages = plain.len() / PAGE_SIZE;
    let reserve_start = PAGE_SIZE - RESERVE;
    let mut out = vec![0u8; plain.len()];

    for page_index in 0..pages {
        let page_number = (page_index + 1) as u32;
        let enc_start = if page_index == 0 { SALT_SIZE } else { 0 };
        let content =
            &plain[page_index * PAGE_SIZE + enc_start..(page_index + 1) * PAGE_SIZE - RESERVE];
        let mut buf = content.to_vec();
        let length = buf.len();
        let mut iv = [0u8; IV_SIZE];
        rand::rngs::OsRng.fill_bytes(&mut iv);

        let enc = Encryptor::<Aes256>::new(
            GenericArray::from_slice(enc_key),
            GenericArray::from_slice(&iv),
        );
        let cipher_text = enc
            .encrypt_padded_mut::<NoPadding>(&mut buf, length)
            .map_err(|_| Error::Crypto(format!("page {page_number} could not be encrypted")))?;
        let mac = page_hmac(hmac_key, cipher_text, &iv, page_number);

        let dst = &mut out[page_index * PAGE_SIZE..(page_index + 1) * PAGE_SIZE];
        if page_index == 0 {
            dst[..SALT_SIZE].copy_from_slice(salt);
            dst[SALT_SIZE..SALT_SIZE + cipher_text.len()].copy_from_slice(cipher_text);
        } else {
            dst[..cipher_text.len()].copy_from_slice(cipher_text);
        }
        dst[reserve_start..reserve_start + IV_SIZE].copy_from_slice(&iv);
        dst[reserve_start + IV_SIZE..reserve_start + IV_SIZE + HMAC_SIZE].copy_from_slice(&mac);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passphrase_matches_the_documented_constant() {
        assert_eq!(derive_passphrase(), PASSPHRASE);
    }

    #[test]
    fn round_trips_a_page_aligned_database() {
        // Two pages of arbitrary but structured bytes; page 1 starts with the
        // SQLite header and has 80 reserved bytes at the end of each page.
        let mut plain = vec![0u8; PAGE_SIZE * 2];
        plain[..16].copy_from_slice(SQLITE_MAGIC);
        plain[16..18].copy_from_slice(&(PAGE_SIZE as u16).to_be_bytes());
        plain[20] = RESERVE as u8;
        for (index, byte) in plain.iter_mut().enumerate().skip(100) {
            *byte = (index % 251) as u8;
        }
        for page in 0..2 {
            let start = page * PAGE_SIZE + PAGE_SIZE - RESERVE;
            plain[start..start + RESERVE].fill(0);
        }
        let salt = [7u8; SALT_SIZE];
        let encrypted = encrypt_verified(&plain, PASSPHRASE, &salt).expect("encrypt");
        assert_eq!(encrypted.len(), plain.len());
        assert_eq!(&encrypted[..SALT_SIZE], &salt);
        let decrypted = decrypt(&encrypted, PASSPHRASE).expect("decrypt");
        assert_eq!(decrypted, plain);
    }

    #[test]
    fn detects_a_corrupted_page() {
        let mut plain = vec![0u8; PAGE_SIZE];
        plain[..16].copy_from_slice(SQLITE_MAGIC);
        let mut encrypted = encrypt(&plain, PASSPHRASE, &[3u8; SALT_SIZE]).expect("encrypt");
        encrypted[PAGE_SIZE - RESERVE - 1] ^= 0xff;
        assert!(decrypt(&encrypted, PASSPHRASE).is_err());
    }

    #[test]
    fn rejects_a_wrong_passphrase() {
        let mut plain = vec![0u8; PAGE_SIZE];
        plain[..16].copy_from_slice(SQLITE_MAGIC);
        let encrypted = encrypt(&plain, PASSPHRASE, &[1u8; SALT_SIZE]).expect("encrypt");
        assert!(decrypt(&encrypted, "nope").is_err());
    }
}
