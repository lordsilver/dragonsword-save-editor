//! Save format, catalog, and editing engine for DragonSword Awakening.
//!
//! The game stores a SQLCipher v4 database (`<account>_Slot<N>.db`) plus a
//! cosmetic Unreal `SPack_Slot<N>.sav` and a screenshot. This crate opens the
//! encrypted database, exposes typed gameplay views, and writes it back with
//! the original salt so the game can read it unchanged.

pub mod catalog;
pub mod consistency;
pub mod domain;
pub mod error;
pub mod raw;
pub mod save;
pub mod sqlcipher;

pub use catalog::{Catalog, Item};
pub use consistency::ConsistencyReport;
pub use error::{Error, Result};
pub use save::{SaveSession, SlotInfo, WriteReport};
