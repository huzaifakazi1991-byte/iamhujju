# Take your GitHub profile page live (2 minutes)

GitHub shows a profile README when a **public repository exists with the exact
same name as your username**. It can only be created by you (account owner).

## Step 1 — Create the special repo
1. Go to https://github.com/new
2. Repository name: **huzaifakazi1991-byte** (must match your username exactly)
3. Visibility: **Public** ✅ — otherwise the profile doesn't render
4. ✅ "Add a README" → Create repository

## Step 2 — One command fills it with your professional profile
From any machine with `gh` authenticated as you:

```bash
gh repo clone huzaifakazi1991-byte/huzaifakazi1991-byte
cd huzaifakazi1991-byte
gh api repos/huzaifakazi1991-byte/iamhujju/contents/docs/github-profile/README.md --jq .content | base64 -d > README.md
git add README.md && git commit -m "feat: professional profile — autonomous AI agent developer & prompt engineer"
git push
```

(Or simply copy the file `docs/github-profile/README.md` from the iamhujju
repo into a new `README.md` via the GitHub web editor.)

## Step 3 — Verify
Open https://github.com/huzaifakazi1991-byte — the profile card at the top of
your profile page now renders the full "Autonomous AI Agent Developer ·
Prompt Engineer" README.

## Optional polish (recommended)
- **Pinned repos**: profile → "Customize your pins" → pin `iamhujju`,
  `freellmapi`, `hermes-agent`, `claude-mem`.
- **About/bio**: profile sidebar → Edit profile → About:
  `Autonomous AI agent developer · Prompt engineer · Building iamhujju.com`
  and Website: `https://iamhujju.com`

## Language stats note
- The profile's language card **excludes forks** (`hermes-agent`, `diffusers`,
  `freellmapi`, `claude-mem`, `awesome-python`) — forks carry ~129 MB of
  third-party Python and classes and would bury real work. If you re-create
  the card yourself, add
  `&exclude_repo=freellmapi,hermes-agent,claude-mem,diffusers,awesome-python`.
- The **iamhujju repo is classified TypeScript** via the root `.gitattributes`
  (`linguist-vendored` on the archived legacy workspace); GitHub may take a
  few minutes to recompute after merge.
