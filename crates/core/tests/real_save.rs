//! Round-trips a real save. Ignored by default because the save is personal
//! data; run it with `DSA_SAVE=/path/to/123456789_Slot3.db cargo test -p dsa-core
//! --test real_save -- --ignored`.

use std::fs;
use std::path::PathBuf;

use dsa_core::SaveSession;
use dsa_core::catalog::Catalog;
use dsa_core::raw::RawValue;

/// The save's gold, as the Currencies screen reads it.
fn gold_of(game: &dsa_core::domain::Game<'_>) -> i64 {
    game.currencies()
        .expect("currencies")
        .iter()
        .find(|currency| currency.item.cid == 1_000_001)
        .map_or(0, |currency| currency.amount)
}

fn copy_fixture() -> (PathBuf, PathBuf) {
    let source = PathBuf::from(std::env::var("DSA_SAVE").expect("set DSA_SAVE"));
    // One folder per test thread: the tests run in parallel and each removes its own.
    let thread = format!("{:?}", std::thread::current().id())
        .replace(|c: char| !c.is_ascii_alphanumeric(), "");
    let directory = std::env::temp_dir().join(format!("dsa-real-{}-{thread}", std::process::id()));
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

        // Complete the first quest in progress the editor can complete, so
        // the write below carries a quest completion too.
        let ready = game
            .quests_in_progress()
            .expect("quests in progress")
            .into_iter()
            .find(|quest| quest.blocked.is_none());
        if let Some(quest) = ready {
            let completion = game.complete_quest(quest.quest_id).expect("complete");
            println!(
                "completed {} ({}): {} rewards, {} corps levels, grade {:?}, started {:?}",
                quest.quest_id,
                quest.name_en,
                completion.grant.granted.len(),
                completion.levels_gained,
                completion.new_grade,
                completion
                    .started
                    .iter()
                    .map(|started| started.quest_id)
                    .collect::<Vec<_>>(),
            );
        }

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

/// A hero's `HP` column is its current health, so it can never exceed the Max
/// HP the game's formulas give it with what it wears. In the 2026-10-27 save
/// every hero was at full health and the two matched exactly, gear, sets and
/// karma included (docs/game-rules.md, Hero stats).
#[test]
#[ignore = "needs DSA_SAVE pointing at a copy of a real save"]
fn current_health_never_exceeds_the_computed_max_hp() {
    let (directory, path) = copy_fixture();
    let mut session = SaveSession::open(&path).expect("open save");
    {
        let game = session.catalog_game(Catalog::shared());
        for character in game.characters().expect("characters") {
            if !character.joined {
                continue;
            }
            let Some(stats) = &character.stats else {
                continue;
            };
            println!(
                "{} Lv {}: HP {} / max {} · attack {} · defence {} · critical {:.4}",
                character.item.name_en,
                character.level,
                character.hp,
                stats.max_hp,
                stats.attack,
                stats.defence,
                stats.critical
            );
            assert!(
                character.hp <= stats.max_hp,
                "{} has HP {} above its computed max {}",
                character.item.name_en,
                character.hp,
                stats.max_hp
            );
        }
    }
    session.close();
    fs::remove_dir_all(directory).ok();
}

/// Reads the save's world progress and edits it on a copy: an opened chest
/// hands out its loot once and stays opened, a statue restored activates its
/// warp.
#[test]
#[ignore = "needs DSA_SAVE pointing at a copy of a real save"]
fn world_progress_reads_and_round_trips() {
    use dsa_core::world::PlaceKind;

    let (directory, path) = copy_fixture();
    let mut session = SaveSession::open(&path).expect("open save");
    {
        let mut game = session.catalog_game(Catalog::shared());
        let world = game.world().expect("world");
        let active = world.waypoints.iter().filter(|w| w.active).count();
        let opened = world.chests.iter().filter(|c| c.opened).count();
        let found = world.dungeons.iter().filter(|d| d.found).count();
        println!(
            "waypoints {active}/{} · chests {opened}/{} · dungeons {found}/{} · player {:?}",
            world.waypoints.len(),
            world.chests.len(),
            world.dungeons.len(),
            world.player.as_ref().map(|p| (p.world, p.x, p.y))
        );
        for region in &world.regions {
            let missions: Vec<String> = region
                .missions
                .iter()
                .map(|m| format!("{} {}/{}", m.kind, m.done, m.total))
                .collect();
            println!("  {}: {}", region.name.en, missions.join(", "));
            for mission in &region.missions {
                assert!(
                    mission.done <= mission.total,
                    "{} {}",
                    region.name.en,
                    mission.kind
                );
            }
        }
        let log = game.quest_log().expect("quest log");
        let states = |state: &str| log.iter().filter(|q| q.state == state).count();
        println!(
            "quests done {} active {} open {}",
            states("done"),
            states("active"),
            states("open")
        );
        for quest in log.iter().filter(|q| q.state == "active") {
            let step = quest.step.as_ref().expect("an active quest has a step");
            println!(
                "  {} step {} ({}): {:?}",
                quest.name_en,
                step.id,
                step.count,
                step.text.as_ref().map(|t| &t.en)
            );
        }

        // Opening a chest hands out its loot: every chest gives a fixed amount
        // of gold and corps EXP in its first two draws.
        let chest = world
            .chests
            .iter()
            .find(|c| !c.opened && c.lock.is_some() && c.loot)
            .expect("a shut chest");
        let loot = game.chest_loot(chest.id).expect("loot");
        let fixed = |cid: i64| {
            loot.iter()
                .find(|draw| draw.options.len() == 1 && draw.options[0].item.cid == cid)
                .map(|draw| draw.options[0].min * draw.times)
                .unwrap_or(0)
        };
        let gold = fixed(1_000_001);
        let corps = fixed(1_000_201);
        assert!(gold > 0 && corps > 0, "{loot:?}");
        let gold_before = gold_of(&game);
        let corps_before = game.overview().expect("overview").adventure_exp;
        let opening = game
            .complete_world_places(PlaceKind::Chest, &[chest.id], true)
            .expect("open chest");
        println!(
            "opened {} ({} levels): {:?}",
            chest.name.en,
            opening.levels_gained,
            opening
                .grant
                .granted
                .iter()
                .map(|g| (&g.item.name_en, g.count))
                .collect::<Vec<_>>()
        );
        assert_eq!(opening.done, 1);
        assert!(
            opening.grant.not_granted.is_empty(),
            "{:?}",
            opening.grant.not_granted
        );
        assert_eq!(gold_of(&game), gold_before + gold);
        assert!(
            game.overview().expect("overview").adventure_exp >= corps_before + corps
                || opening.levels_gained > 0
        );
        let after = game.world().expect("world");
        let now = after
            .chests
            .iter()
            .find(|c| c.id == chest.id)
            .expect("chest");
        assert!(now.opened && now.released);
        // An opened chest gives nothing again.
        let again = game
            .complete_world_places(PlaceKind::Chest, &[chest.id], true)
            .expect("open again");
        assert_eq!((again.done, again.already_done), (0, 1));
        assert!(again.grant.granted.is_empty());
        assert_eq!(gold_of(&game), gold_before + gold);
        // Undone, it keeps its lock open; opened without rewards, it gives nothing.
        game.undo_world_places(PlaceKind::Chest, &[chest.id])
            .expect("undo");
        let now = game.world().expect("world");
        let now = now.chests.iter().find(|c| c.id == chest.id).expect("chest");
        assert!(!now.opened && now.released);
        let quiet = game
            .complete_world_places(PlaceKind::Chest, &[chest.id], false)
            .expect("open without rewards");
        assert_eq!(quiet.done, 1);
        assert!(quiet.grant.granted.is_empty());
        assert_eq!(gold_of(&game), gold_before + gold);

        let statue = world
            .waypoints
            .iter()
            .find(|w| w.statue.as_ref().is_some_and(|s| !s.restored))
            .expect("a broken statue");
        let statue_id = statue.statue.as_ref().unwrap().id;
        game.complete_world_places(PlaceKind::Statue, &[statue_id], true)
            .expect("restore");
        let after = game.world().expect("world");
        let now = after
            .waypoints
            .iter()
            .find(|w| w.id == statue.id)
            .expect("statue");
        let progress = now.statue.as_ref().unwrap();
        assert!(now.active && progress.restored && progress.found == progress.pieces);

        let dungeon = world
            .dungeons
            .iter()
            .find(|d| !d.found)
            .expect("a dungeon not found");
        game.complete_world_places(PlaceKind::Dungeon, &[dungeon.id], true)
            .expect("find");
        assert!(
            game.world()
                .unwrap()
                .dungeons
                .iter()
                .any(|d| d.id == dungeon.id && d.found)
        );

        // Activating a warp point gives its 100 corps EXP, once.
        let warp = world
            .waypoints
            .iter()
            .find(|w| !w.active && w.kind == "waypoint")
            .expect("a warp point not activated");
        assert_eq!(warp.reward.len(), 1);
        assert_eq!(
            (warp.reward[0].item.cid, warp.reward[0].count),
            (1_000_201, 100)
        );
        let activation = game
            .complete_world_places(PlaceKind::Waypoint, &[warp.id], true)
            .expect("activate");
        assert_eq!(activation.done, 1);
        assert_eq!(activation.grant.granted.len(), 1);
        assert_eq!(activation.grant.granted[0].count, 100);
        let again = game
            .complete_world_places(PlaceKind::Waypoint, &[warp.id], true)
            .expect("activate again");
        assert_eq!((again.done, again.already_done), (0, 1));
        assert!(again.grant.granted.is_empty());

        let shut: Vec<i64> = world
            .waypoints
            .iter()
            .filter(|w| !w.active && w.kind != "statue")
            .map(|w| w.id)
            .collect();
        game.complete_world_places(PlaceKind::Waypoint, &shut, true)
            .expect("activate all");
        assert!(
            game.world()
                .unwrap()
                .waypoints
                .iter()
                .filter(|w| w.kind != "statue")
                .all(|w| w.active)
        );
    }
    session.close();
    fs::remove_dir_all(directory).ok();
}
