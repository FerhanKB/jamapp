# GitHub push setup

One-time setup to push this repo to `github.com/ferhankb/jamapp`.

## 1. Create the empty repo

https://github.com/new → name `jamapp` → **leave README/license/gitignore unchecked** → Create.

## 2. Authenticate

### Option A — HTTPS + Personal Access Token

```
git remote set-url origin https://github.com/ferhankb/jamapp.git
git push -u origin main
```

When prompted: username `ferhankb`, password = a Personal Access Token.

Create token at https://github.com/settings/tokens → *Generate new token (classic)* → scope `repo` → copy.

Save the token in a password manager — GitHub shows it only once.

### Option B — SSH key

```
ls ~/.ssh/id_ed25519.pub 2>/dev/null || ssh-keygen -t ed25519 -C "ferhankb@github"
cat ~/.ssh/id_ed25519.pub
```

Copy the output → https://github.com/settings/keys → *New SSH key* → paste → save.

Then:
```
git remote set-url origin git@github.com:ferhankb/jamapp.git
git push -u origin main
```

## 3. Troubleshooting

- **`Permission denied (publickey)`** — SSH key not added to GitHub. Use Option A or add the key.
- **`rejected — non-fast-forward`** — the remote repo was initialized with a README. Either recreate it empty, or `git pull --rebase origin main` once, then push.
