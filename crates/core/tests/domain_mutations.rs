//! End-to-end mutation coverage against a real progressed save. Ignored by
//! default because it needs personal data; run it with
//! `DSA_SAVE=/path/to/1000_Slot5.db cargo test -p dsa-core --test domain_mutations -- --ignored`.

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use dsa_core::SaveSession;
use dsa_core::catalog::Catalog;
use dsa_core::raw::RawValue;

fn copy_fixture() -> (PathBuf, PathBuf) {
    let source = PathBuf::from(std::env::var("DSA_SAVE").expect("set DSA_SAVE"));
    let directory = std::env::temp_dir().join(format!("dsa-mutations-{}", std::process::id()));
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
#[ignore = "needs DSA_SAVE pointing at a progressed save"]
fn every_mutation_survives_a_write() {
    let (directory, path) = copy_fixture();
    let original = fs::read(&path).expect("read original");
    let catalog = Catalog::shared();

    let (
        character_a,
        character_b,
        mut gem_dbid,
        equipment_dbid,
        karma_dbid,
        stackable_cid,
        team_page,
    ): (i64, i64, i64, i64, i64, i64, i64);
    let baseline;
    let expected_team_slots;
    let (expected_level, expected_exp, karma_ascend, karma_transcend);
    {
        let mut session = SaveSession::open(&path).expect("open");
        // A clean game-written save and a save that already has damage both
        // exercise the same mutations. The test repairs gem links below, but
        // any team problems the save already had must survive untouched.
        baseline = session.consistency().clone();
        {
            let mut game = session.catalog_game(catalog);

            // Overview, adventure and currency. Values above the reference
            // maxima are refused before anything is written.
            game.set_player_name("Silver Test").expect("rename");
            for grade in [0, 1, 6, 7] {
                assert!(game.set_adventure("grade", grade).is_err());
            }
            assert!(game.set_adventure("level", 81).is_err());
            assert!(game.set_adventure("exp", 962_501).is_err());
            game.set_adventure("level", 42).expect("adventure level");
            assert!(game.set_currency(1_000_001, 47_451_810).is_err());
            game.set_currency(1_000_001, 987_654).expect("currency");

            // Inventory: change an existing stack and add a missing one.
            let inventory = game.inventory().expect("inventory");
            let first_stack = inventory
                .iter()
                .find(|stack| stack.kind == "stackable")
                .expect("a stackable stack");
            stackable_cid = first_stack.id.parse().expect("stack id");
            assert!(game.set_stack("stackable", stackable_cid, 61_526).is_err());
            game.set_stack("stackable", stackable_cid, 777)
                .expect("set stack");

            let owned: HashSet<i64> = inventory
                .iter()
                .filter(|stack| stack.kind == "stackable")
                .map(|stack| stack.id.parse().expect("id"))
                .collect();
            let missing_stack = game
                .stackable_catalog()
                .into_iter()
                .find(|item| !owned.contains(&item.cid))
                .expect("a missing stackable");
            game.add_stackable(missing_stack.cid, 5)
                .expect("add stackable");
            let added = game
                .inventory()
                .expect("inventory")
                .into_iter()
                .find(|stack| stack.id == missing_stack.cid.to_string())
                .expect("added stack");
            assert_eq!(added.count, 5);

            // Characters: stats, skills, team and the shop-only recruit guard.
            let characters = game.characters().expect("characters");
            character_a = characters[0].cid;
            character_b = characters[1].cid;
            let first = character_a;
            let limits = characters[0].limits.clone();
            assert!(
                game.set_character(first, "level", limits.level + 1)
                    .is_err()
            );
            game.set_character(first, "level", limits.level)
                .expect("character level");
            assert!(game.set_character(first, "exp", limits.exp + 1).is_err());
            game.set_character(first, "exp", limits.exp)
                .expect("character exp");
            (expected_level, expected_exp) = (limits.level, limits.exp);
            if limits.level > 20 {
                assert!(
                    game.set_character(first, "ascend", 0).is_err(),
                    "the level needs a higher breakthrough"
                );
            }
            let ascend = characters[0].ascend.max(limits.ascend);
            game.set_character(first, "ascend", ascend)
                .expect("character ascend");
            assert!(game.set_character(first, "ascend", ascend + 1).is_err());
            // The breakthrough may have moved, so read the hero's caps again.
            let limits = game
                .characters()
                .expect("characters")
                .into_iter()
                .find(|character| character.cid == first)
                .expect("character")
                .limits;
            game.set_character(first, "transcend", 0)
                .expect("reset transcend");
            assert!(
                game.set_character(first, "transcend", limits.transcend + 1)
                    .is_err()
            );
            game.set_character(first, "transcend", limits.transcend)
                .expect("character transcend");
            assert!(game.set_character(first, "hp", 22_230).is_err());
            assert!(game.set_skill(first, 8, 1).is_err());
            game.set_skill(first, 3, 0).expect("reset skill");
            assert!(game.set_skill(first, 3, limits.skill_low + 1).is_err());
            game.set_skill(first, 3, limits.skill_low)
                .expect("skill upsert");
            assert!(
                game.skills(first)
                    .expect("skills")
                    .iter()
                    .any(|skill| skill.type_value == 3 && skill.level == limits.skill_low)
            );
            game.remove_skill(first, 3).expect("skill remove");
            let team = game
                .teams()
                .expect("teams")
                .into_iter()
                .next()
                .expect("team page");
            team_page = team.page_id;
            let original_slots: Vec<i64> = team.slots.iter().map(|slot| slot.cid).collect();
            let candidate = game
                .characters()
                .expect("characters")
                .into_iter()
                .map(|character| character.cid)
                .find(|cid| !original_slots.contains(cid));
            let mut expected_slots = original_slots.clone();
            if let Some(candidate) = candidate
                && let Some(empty) = original_slots.iter().position(|cid| *cid == 0)
            {
                game.set_team_slot(team_page, (empty + 1) as i64, candidate)
                    .expect("team slot");
                expected_slots[empty] = candidate;
            } else {
                // The page is full, or every owned character is already on it.
                // Assigning the current occupant is still a valid no-op.
                game.set_team_slot(team_page, 1, original_slots[0])
                    .expect("team slot no-op");
            }
            let page = game
                .teams()
                .expect("teams")
                .into_iter()
                .find(|page| page.page_id == team_page)
                .expect("team page");
            let slots: Vec<i64> = page.slots.iter().map(|slot| slot.cid).collect();
            assert_eq!(slots, expected_slots);
            expected_team_slots = expected_slots;

            // Direct recruiting is off: tb_init_character is the new-account
            // seed, not the roster of characters this save owns. Both the
            // single and the bulk path must refuse; shop recruiting happens
            // in the game after adding Fate's Invitation.
            assert!(game.add_character(10_002).is_err());
            assert!(game.add_character(10_015).is_err());
            assert!(game.add_character(1_110_001).is_err());
            assert!(game.unlock_all_characters().is_err());
            let roster = game.characters().expect("characters");
            assert_eq!(roster.len(), characters.len(), "no character was added");

            // Gem links: both reference saves carry earlier tool damage (a
            // GEM_DBID that names no live gem), so clear those first. Then
            // pick a real gem that no piece uses.
            let live: HashSet<i64> = game
                .gems()
                .expect("gems")
                .into_iter()
                .map(|gem| gem.dbid.parse().expect("gem id"))
                .collect();
            for piece in game.equipment().expect("equipment") {
                let link: i64 = piece.gem_dbid.parse().expect("gem link");
                if link != 0 && !live.contains(&link) {
                    game.set_equipment_gem(piece.dbid.parse().expect("equipment dbid"), 0)
                        .expect("clear dangling gem link");
                }
            }
            // Equipment: ordinary columns, the 64-bit gem id and a stat value.
            let equipment = game.equipment().expect("equipment");
            let piece = equipment.first().expect("equipment row");
            equipment_dbid = piece.dbid.parse().expect("equipment dbid");
            assert!(equipment_dbid > 9_007_199_254_740_992);

            // A clean game-written save may have every gem linked. Use the
            // first piece's gem, unlinking it first so it can be linked back;
            // fall back to any unlinked gem, and skip gem-specific edits if the
            // save has none at all.
            gem_dbid = piece.gem_dbid.parse().expect("gem link");
            if gem_dbid != 0 {
                game.set_equipment_gem(equipment_dbid, 0)
                    .expect("unlink the gem under test");
            } else {
                let linked: HashSet<i64> = game
                    .equipment()
                    .expect("equipment")
                    .into_iter()
                    .map(|piece| piece.gem_dbid.parse().expect("gem link"))
                    .filter(|link| *link != 0)
                    .collect();
                gem_dbid = game
                    .gems()
                    .expect("gems")
                    .into_iter()
                    .find(|gem| {
                        let dbid: i64 = gem.dbid.parse().expect("gem id");
                        !linked.contains(&dbid)
                    })
                    .map(|gem| gem.dbid.parse().expect("gem dbid"))
                    .unwrap_or(0);
            }
            assert!(
                game.set_equipment(equipment_dbid, "enchantLevel", 16)
                    .is_err()
            );
            game.set_equipment(equipment_dbid, "enchantLevel", 15)
                .expect("enchant");
            assert!(game.set_equipment(equipment_dbid, "exp", 90_001).is_err());
            game.set_equipment(equipment_dbid, "exp", 1_234)
                .expect("equipment exp");
            game.set_equipment(equipment_dbid, "isLock", 1)
                .expect("lock");
            assert!(
                game.set_equipment(equipment_dbid, "gemDbid", 70_000_000_823_123_456)
                    .is_err(),
                "the generic field list must not write 64-bit gem ids"
            );
            assert!(
                game.set_equipment_gem(equipment_dbid, 70_000_000_823_123_456)
                    .is_err(),
                "a link to a missing gem is refused"
            );
            if gem_dbid != 0 {
                game.set_equipment_gem(equipment_dbid, gem_dbid)
                    .expect("gem dbid");
                if let Some(other) = game
                    .equipment()
                    .expect("equipment")
                    .into_iter()
                    .find(|piece| piece.dbid != equipment_dbid.to_string())
                {
                    assert!(
                        game.set_equipment_gem(
                            other.dbid.parse().expect("equipment dbid"),
                            gem_dbid
                        )
                        .is_err(),
                        "a gem can only be linked to one piece"
                    );
                }
            }
            if piece.has_stat_values {
                game.set_equipment(equipment_dbid, "mainStatValue", 321)
                    .expect("stat value");
            }
            let piece = game
                .equipment()
                .expect("equipment")
                .into_iter()
                .find(|piece| piece.dbid == equipment_dbid.to_string())
                .expect("equipment row");
            assert_eq!(piece.enchant_level, 15);
            assert_eq!(piece.exp, 1_234);
            assert!(piece.is_lock);
            assert_eq!(piece.gem_dbid, gem_dbid.to_string());

            // Gems: stat info, lock and the item-CID type guard.
            if gem_dbid != 0 {
                assert!(game.set_gem(gem_dbid, "itemCid", 1_110_001).is_err());
                game.set_gem(gem_dbid, "statInfoCid", 654_321)
                    .expect("gem stat");
                game.set_gem(gem_dbid, "isLock", 1).expect("gem lock");
                let gem = game
                    .gems()
                    .expect("gems")
                    .into_iter()
                    .find(|gem| gem.dbid == gem_dbid.to_string())
                    .expect("gem");
                assert_eq!(gem.stat_info_cid, 654_321);
                assert!(gem.is_lock);
            }

            // Karma: stats and moving the owner between characters.
            let karma = game
                .karma()
                .expect("karma")
                .into_iter()
                .next()
                .expect("karma");
            karma_dbid = karma.dbid.parse().expect("karma dbid");
            let limits = karma.limits;
            game.set_karma(karma_dbid, "exp", 0)
                .expect("reset karma exp");
            assert!(game.set_karma(karma_dbid, "exp", limits.exp + 1).is_err());
            game.set_karma(karma_dbid, "exp", 555).expect("karma exp");
            game.set_karma(karma_dbid, "ascend", 0)
                .expect("reset karma ascend");
            assert!(
                game.set_karma(karma_dbid, "ascend", limits.ascend + 1)
                    .is_err()
            );
            game.set_karma(karma_dbid, "ascend", 2.min(limits.ascend))
                .expect("karma ascend");
            game.set_karma(karma_dbid, "transcend", 0)
                .expect("reset karma transcend");
            assert!(
                game.set_karma(karma_dbid, "transcend", limits.transcend + 1)
                    .is_err()
            );
            game.set_karma(karma_dbid, "transcend", 1.min(limits.transcend))
                .expect("karma transcend");
            (karma_ascend, karma_transcend) = (2.min(limits.ascend), 1.min(limits.transcend));
            game.set_karma(karma_dbid, "isLock", 1).expect("karma lock");
            game.equip_karma(character_a, karma_dbid)
                .expect("equip karma");
            let equipped = game
                .karma()
                .expect("karma")
                .into_iter()
                .find(|karma| karma.dbid == karma_dbid.to_string())
                .expect("karma");
            assert_eq!(equipped.equipped_by, Some(character_a));
            game.equip_karma(character_b, karma_dbid)
                .expect("move karma");
            let karma = game.karma().expect("karma");
            let equipped = karma
                .iter()
                .find(|karma| karma.dbid == karma_dbid.to_string())
                .expect("karma");
            assert_eq!(equipped.equipped_by, Some(character_b));
            assert!(
                !karma
                    .iter()
                    .any(|karma| karma.dbid == karma_dbid.to_string()
                        && karma.equipped_by == Some(character_a))
            );

            // Costumes: unlock, wear and take off.
            let owned: HashSet<i64> = game
                .costumes()
                .expect("costumes")
                .into_iter()
                .map(|costume| costume.cid)
                .collect();
            let missing = game
                .costume_catalog()
                .expect("costume catalog")
                .into_iter()
                .find(|entry| !owned.contains(&entry.item.cid))
                .expect("a missing costume")
                .item
                .cid;
            assert!(game.unlock_costume(missing).expect("unlock costume"));
            let costume = game
                .costumes()
                .expect("costumes")
                .into_iter()
                .find(|costume| costume.cid == missing)
                .expect("costume");
            let costume_id: i64 = costume.dbid.parse().expect("costume dbid");
            game.equip_costume(costume_id, character_a)
                .expect("wear costume");
            let costume = game
                .costumes()
                .expect("costumes")
                .into_iter()
                .find(|costume| costume.dbid == costume_id.to_string())
                .expect("costume");
            assert_eq!(costume.equip_character_cid, character_a);
            game.equip_costume(costume_id, 0).expect("remove costume");
            let costume = game
                .costumes()
                .expect("costumes")
                .into_iter()
                .find(|costume| costume.dbid == costume_id.to_string())
                .expect("costume");
            assert_eq!(costume.equip_character_cid, 0);

            // Mounts: unlock and move the owner.
            let owned: HashSet<i64> = game
                .mounts()
                .expect("mounts")
                .into_iter()
                .map(|mount| mount.cid)
                .collect();
            let missing = game
                .mount_catalog()
                .expect("mount catalog")
                .into_iter()
                .find(|entry| !owned.contains(&entry.item.cid))
                .expect("a missing mount")
                .item
                .cid;
            assert!(game.unlock_mount(missing).expect("unlock mount"));
            let mount = game
                .mounts()
                .expect("mounts")
                .into_iter()
                .find(|mount| mount.cid == missing)
                .expect("mount");
            let mount_id: i64 = mount.dbid.parse().expect("mount dbid");
            game.equip_mount(character_a, mount_id)
                .expect("equip mount");
            game.equip_mount(character_b, mount_id).expect("move mount");
            let mounts = game.mounts().expect("mounts");
            let mount = mounts
                .iter()
                .find(|mount| mount.dbid == mount_id.to_string())
                .expect("mount");
            assert_eq!(mount.equipped_by, Some(character_b));
            assert!(
                !mounts.iter().any(|mount| mount.dbid == mount_id.to_string()
                    && mount.equipped_by == Some(character_a))
            );

            // Titles and recipes: single toggles, then unlock everything.
            let title = game
                .titles()
                .expect("titles")
                .into_iter()
                .next()
                .expect("title");
            game.set_title_unlocked(title.id, true).expect("title on");
            assert!(
                game.titles()
                    .expect("titles")
                    .iter()
                    .any(|entry| entry.id == title.id && entry.unlocked)
            );
            game.set_title_unlocked(title.id, false).expect("title off");
            assert!(
                !game
                    .titles()
                    .expect("titles")
                    .iter()
                    .any(|entry| entry.id == title.id && entry.unlocked)
            );
            game.unlock_all_titles().expect("unlock titles");
            assert!(
                game.titles()
                    .expect("titles")
                    .iter()
                    .all(|entry| entry.unlocked)
            );

            let recipe = game
                .recipes()
                .expect("recipes")
                .into_iter()
                .next()
                .expect("recipe");
            game.set_recipe_known(recipe.key, true).expect("recipe on");
            assert!(
                game.recipes()
                    .expect("recipes")
                    .iter()
                    .any(|entry| entry.key == recipe.key && entry.known)
            );
            game.set_recipe_known(recipe.key, false)
                .expect("recipe off");
            assert!(
                !game
                    .recipes()
                    .expect("recipes")
                    .iter()
                    .any(|entry| entry.key == recipe.key && entry.known)
            );
            game.unlock_all_recipes().expect("unlock recipes");
            assert!(
                game.recipes()
                    .expect("recipes")
                    .iter()
                    .all(|entry| entry.known)
            );

            // Invalid input is rejected without touching the file.
            assert!(game.set_currency(1_000_001, -1).is_err());
            assert!(game.set_character(first, "nope", 1).is_err());
            assert!(game.equip_karma(999_999, karma_dbid).is_err());
        }

        // Raw browser.
        let page = session
            .raw_page("tb_currency", 0, 10, None)
            .expect("raw page");
        let row = page
            .rows
            .iter()
            .find(|row| matches!(&row.cells[2], RawValue::Integer(value) if value == "987654"))
            .expect("edited currency row");
        session
            .raw_update(
                "tb_currency",
                row.rowid.parse().expect("rowid"),
                "AMOUNT",
                &RawValue::Integer("1234".into()),
                false,
            )
            .expect("raw update");

        // Key columns stay locked unless advanced editing is on, and the
        // account column is never writable.
        let equipment_page = session
            .raw_page("tb_equipment", 0, 5, None)
            .expect("equipment page");
        let equipment_row = equipment_page.rows.first().expect("equipment row");
        let equipment_rowid = equipment_row.rowid.parse().expect("rowid");
        assert!(
            session
                .raw_update(
                    "tb_equipment",
                    equipment_rowid,
                    "ITEM_DBID",
                    &RawValue::Integer("1".into()),
                    false,
                )
                .is_err()
        );
        assert!(
            session
                .raw_update(
                    "tb_equipment",
                    equipment_rowid,
                    "USER_DBID",
                    &RawValue::Integer("1".into()),
                    true,
                )
                .is_err()
        );
        assert!(
            session
                .raw_update(
                    "tb_equipment",
                    equipment_rowid,
                    "ENCHANT_LEVEL",
                    &RawValue::Text("not a number".into()),
                    false,
                )
                .is_err()
        );
        assert!(session.raw_page("sqlite_master", 0, 5, None).is_err());

        assert!(session.dirty());
        let report = session.write().expect("write");
        assert!(report.backup.is_some());
        assert!(
            report.consistency.new_since(&baseline).is_clean(),
            "the write introduces no consistency problem beyond the save's baseline"
        );
        assert!(!session.dirty());
        session.close();
    };

    let backup = fs::read_dir(&directory)
        .expect("read dir")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .find(|path| path.extension().is_some_and(|extension| extension == "bak"))
        .expect("backup");
    assert_eq!(
        fs::read(&backup).expect("read backup"),
        original,
        "backup keeps the original bytes"
    );

    let mut session = SaveSession::open(&path).expect("reopen");
    {
        let game = session.catalog_game(catalog);
        let overview = game.overview().expect("overview");
        assert_eq!(overview.player_name, "Silver Test");
        assert_eq!(overview.adventure_level, 42);
        assert_eq!(
            overview
                .currencies
                .iter()
                .find(|currency| currency.item.cid == 1_000_001)
                .expect("gold")
                .amount,
            1_234
        );

        let stack = game
            .inventory()
            .expect("inventory")
            .into_iter()
            .find(|stack| stack.id == stackable_cid.to_string())
            .expect("stack");
        assert_eq!(stack.count, 777);

        let character = game
            .characters()
            .expect("characters")
            .into_iter()
            .find(|character| character.cid == character_a)
            .expect("character");
        assert_eq!(character.level, expected_level);
        assert_eq!(character.exp, expected_exp);
        assert!(
            !game
                .skills(character_a)
                .expect("skills")
                .iter()
                .any(|skill| skill.type_value == 3)
        );
        let team = game
            .teams()
            .expect("teams")
            .into_iter()
            .find(|page| page.page_id == team_page)
            .expect("team page");
        let slots: Vec<i64> = team.slots.iter().map(|slot| slot.cid).collect();
        assert_eq!(slots, expected_team_slots);

        let piece = game
            .equipment()
            .expect("equipment")
            .into_iter()
            .find(|piece| piece.dbid == equipment_dbid.to_string())
            .expect("equipment");
        assert_eq!(piece.enchant_level, 15);
        assert_eq!(piece.exp, 1_234);
        assert!(piece.is_lock);
        assert_eq!(piece.gem_dbid, gem_dbid.to_string());

        let live: HashSet<i64> = game
            .gems()
            .expect("gems")
            .into_iter()
            .map(|gem| gem.dbid.parse().expect("gem id"))
            .collect();
        let mut seen = HashSet::new();
        for piece in game.equipment().expect("equipment") {
            let link: i64 = piece.gem_dbid.parse().expect("gem link");
            if link == 0 {
                continue;
            }
            assert!(
                live.contains(&link),
                "equipment {} links gem {}, which is not in the save",
                piece.dbid,
                link
            );
            assert!(
                seen.insert(link),
                "gem {} is linked to more than one piece",
                link
            );
        }

        if gem_dbid != 0 {
            let gem = game
                .gems()
                .expect("gems")
                .into_iter()
                .find(|gem| gem.dbid == gem_dbid.to_string())
                .expect("gem");
            assert_eq!(gem.stat_info_cid, 654_321);
            assert!(gem.is_lock);
        }

        let karma = game.karma().expect("karma");
        let karma_entry = karma
            .iter()
            .find(|karma| karma.dbid == karma_dbid.to_string())
            .expect("karma");
        assert_eq!(karma_entry.exp, 555);
        assert_eq!(karma_entry.ascend, karma_ascend);
        assert_eq!(karma_entry.transcend, karma_transcend);
        assert!(karma_entry.is_lock);
        assert_eq!(karma_entry.equipped_by, Some(character_b));

        let mounts = game.mounts().expect("mounts");
        assert!(
            mounts
                .iter()
                .any(|mount| mount.equipped_by == Some(character_b))
        );

        assert!(
            game.titles()
                .expect("titles")
                .iter()
                .all(|entry| entry.unlocked)
        );
        assert!(
            game.recipes()
                .expect("recipes")
                .iter()
                .all(|entry| entry.known)
        );
    }
    assert!(
        session.consistency().new_since(&baseline).is_clean(),
        "the reopened save has no consistency problem beyond its baseline"
    );
    session.close();

    fs::remove_dir_all(directory).expect("cleanup");
}
