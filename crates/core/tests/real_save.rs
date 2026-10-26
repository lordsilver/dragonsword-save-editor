//! Round-trips a real save. Ignored by default because the save is personal
//! data; run it with `DSA_SAVE=/path/to/123456789_Slot3.db cargo test -p dsa-core
//! --test real_save -- --ignored`.

use std::fs;
use std::path::PathBuf;

use dsa_core::SaveSession;
use dsa_core::catalog::Catalog;
use dsa_core::raw::RawValue;

fn copy_fixture() -> (PathBuf, PathBuf) {
    let source = PathBuf::from(std::env::var("DSA_SAVE").expect("set DSA_SAVE"));
    let directory = std::env::temp_dir().join(format!("dsa-real-{}", std::process::id()));
    fs::create_dir_all(&directory).expect("mkdir");
    let target = directory.join(
        source
            .file_name()
            .expect("save file name")
            .to_string_lossy()
            .to_string(),
    );
    fs::copy(&source, &target).expect("copy save");
    (directory, target)
}

#[test]
#[ignore = "needs DSA_SAVE pointing at a copy of a real save"]
fn reads_and_writes_a_real_save() {
    let (directory, path) = copy_fixture();
    let catalog = Catalog::shared();

    let mut session = SaveSession::open(&path).expect("open save");
    {
        let mut game = session.catalog_game(catalog);
        let overview = game.overview().expect("overview");
        println!(
            "account {} name {:?} characters {} equipment {} titles {}/{} recipes {}/{}",
            overview.account_id,
            overview.player_name,
            overview.counts.characters,
            overview.counts.equipment,
            overview.counts.titles_unlocked,
            overview.counts.titles_total,
            overview.counts.recipes_known,
            overview.counts.recipes_total,
        );
        println!(
            "rank {:?} promotions {}/{} story {}/{} current {:?} next {:?}",
            overview.adventure_rank_en,
            overview.promotions_completed,
            overview.promotions_total,
            overview.story.completed,
            overview.story.total,
            overview.story.current.as_ref().map(|quest| quest.number),
            overview.story.next_promotion.as_ref().map(|next| (
                &next.rank_en,
                next.requires.number,
                next.story_done
            )),
        );
        assert!(overview.story.completed <= overview.story.total);
        assert!(overview.counts.characters > 0);
        assert!(!overview.currencies.is_empty());
        assert!(!game.characters().expect("characters").is_empty());
        assert!(!game.inventory().expect("inventory").is_empty());
        assert!(!game.teams().expect("teams").is_empty());
        assert!(!game.recipes().expect("recipes").is_empty());
        let first = game.characters().expect("characters")[0].cid;
        game.skills(first).expect("skills");
        game.loadout(first).expect("loadout");
        game.set_player_name("Silver-Test").expect("name");
        game.set_currency(1_000_001, 123_456).expect("currency");

        // Grant every completed quest's rewards, so the write below carries
        // the reward rows too.
        let quests: Vec<i64> = game
            .quest_rewards()
            .expect("quest rewards")
            .iter()
            .map(|reward| reward.quest_id)
            .collect();
        let grant = game.grant_quest_rewards(&quests).expect("grant");
        println!(
            "granted {} rewards from {} quests; not granted {:?}; corps EXP not granted {}",
            grant.granted.len(),
            quests.len(),
            grant
                .not_granted
                .iter()
                .map(|entry| (&entry.item.name_en, entry.count))
                .collect::<Vec<_>>(),
            grant.adv_exp_not_granted,
        );
    }

    let page = session
        .raw_page("tb_currency", 0, 10, None)
        .expect("raw page");
    assert!(page.total >= 1);
    let row = &page.rows[0];
    println!("raw row {} {:?}", row.rowid, row.cells);
    session
        .raw_update(
            "tb_currency",
            row.rowid.parse().expect("rowid"),
            "AMOUNT",
            &RawValue::Integer("4242".into()),
            false,
        )
        .expect("raw update");

    let report = session.write().expect("write");
    assert!(report.backup.is_some());
    session.close();

    let mut reopened = SaveSession::open(&path).expect("reopen");
    let overview = reopened
        .catalog_game(catalog)
        .overview()
        .expect("overview after write");
    assert_eq!(overview.player_name, "Silver-Test");
    let page = reopened
        .raw_page("tb_currency", 0, 10, Some("4242"))
        .expect("raw search");
    assert_eq!(page.total, 1);
    drop(reopened);

    fs::remove_dir_all(directory).expect("cleanup");
}
