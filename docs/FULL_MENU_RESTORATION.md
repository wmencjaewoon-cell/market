# AS Home With Full Menus

## Applied Changes

- Keep `SIMPLE_AS_MODE = true` so the AS home and inquiry form stay in place.
- Set `SHOW_FULL_APP_MENUS = true` to show user level, customization, store plans, and store/staff work menus.
- The map tab is hidden following the user's next request. Map exploration remains available through `/explore` on the home screen, independently of the full-menu flag.
- Keep the existing verified-store and staff-role checks. Showing a menu does not bypass server permissions or subscription limits.
- Keep sales, purchases, favorites, and keyword alerts visible for signed-in users regardless of the full-menu flag.
- Use user-oriented level titles instead of seller-oriented titles across shared badges, posts, chat, and profiles. Existing DB column names and earned points are unchanged.
- Restore light/dark theme colors on the level customization screen.
- Add a My Inquiries entry under AS inquiries in My Info.

## Not Activated By This Change

- Paid checkout: choosing a store plan still shows the existing launch-event notice. No payment provider, recurring billing, or charge has been added.
- Inquiry/DIY XP awards: there is no existing DIY completion workflow, and its recording/verification rules are pending. This change does not award points for opening guides or submitting inquiries.
- No database migration or native module installation is required for these menu and label changes.

## Rollback

To hide the restored menus while keeping the AS home, set `SHOW_FULL_APP_MENUS = false` in `lib/appMode.ts`. This does not reverse the new user-facing level titles or theme fixes.

To reverse the code changes from this task only, first check the scoped rollback patch from the repository root:

```sh
git apply --check docs/rollback-full-menu-restoration.patch
```

When the check succeeds:

```sh
git apply docs/rollback-full-menu-restoration.patch
```

The patch compares against the working files at the beginning of this task, preserving earlier uncommitted work, including the four marketplace menus restored in the previous task. It also preserves the subsequent request to hide the map tab. If later edits overlap, the check will fail; reconcile those changes instead of resetting the worktree.

## Verification

- TypeScript check: passed.
- ESLint on changed source files: no errors; two pre-existing warnings in the tab layout and review creation screen.
- Rollback patch: checked without applying.
- Native device interactions, authenticated store/staff accounts, and live database policies were not exercised in this environment.
