# skills-registry 1.1.2

> Searchable static skill-risk registry with heuristic checks, digests, bounded filesystem reads and CSP.

**A reviewable, static index of agent skills, with automated checks and a searchable page.**

Agent skills are instructions that run with real permissions. Before you install one, you should know whether it pipes a download into a shell, deletes from your home folder, or reads your credentials. skills-registry scans every `SKILL.md` in a folder, pins each one to a SHA-256 digest, and publishes a single static page you can search and filter.

**"Checked" means the automated checks passed. It is not a safety review.** Read the skill before you trust it.

## What it checks

| Check | Flags when the skill… |
| --- | --- |
| `pipe-to-shell` | Pipes `curl` or `wget` output into `sh`, `bash` or `zsh` |
| `rm-root` | Deletes from `/`, `~` or `$HOME` |
| `credential-read` | Mentions `.ssh`, `.aws`, `.npmrc`, `.netrc`, `id_rsa` or `.env` |
| `dynamic-eval` | Calls `eval(` or `new Function(` |
| `iex` | Invokes PowerShell runtime expression evaluation |
| `decode-and-run` | Decodes base64 directly into a shell |
| `chmod-world-writable` | Uses `chmod 777` (including recursive mode) |
| `long-base64` | Embeds a blob of 200+ base64 characters |
| metadata | Has no frontmatter, a `name` that does not match its folder, no description, or is over 20 KB |

## Usage

```bash
node build-registry.mjs ./skills ./site
```

Exit codes: `0` all skills checked, `1` one or more flagged, `2` the skills folder is missing or unreadable. Windows (CRLF) checkouts are parsed the same as LF.

This writes two files:

- `site/registry.json`: machine-readable, with status, notes and digests for every skill.
- `site/registry.html`: a standalone page with search, filters, and per-skill digests. It has no external requests and needs no build step.

Example output (from [`examples/`](examples/)):

```
1 checked, 1 flagged -> examples/site
```

Open [`examples/site/registry.html`](examples/site/registry.html) in a browser to see the page.

| Exit | Meaning |
| --- | --- |
| `0` | Every skill checked |
| `1` | At least one skill flagged |
| `2` | Usage error |

## Verify a listing

Each card shows the first 16 characters of the SHA-256 digest. To check a skill you installed:

```bash
shasum -a 256 SKILL.md        # compare with the digest in registry.json
```

A changed digest means the skill changed since it was reviewed.

## CI

Run the builder on every pull request to a skills repo, and fail the job on exit code 1. Publish `site/` with GitHub Pages or any static host.

## Limits

- Pattern checks are regular expressions. They catch the common shapes, not every obfuscated one.
- A clean scan says nothing about whether the instructions are good, correct, or what the skill does at runtime.
- The page includes a hash-based Content Security Policy for its own inline style/script. A stricter hosting header may also need those hashes.
- Symlinked folders/files and non-regular skill files are refused. Sources are capped at 1,000 children; files over 20,000 UTF-8 bytes are flagged without being read, with `sha256: null`. Missing SKILL.md files are flagged; an empty source is an error.
- Output must be outside the skill source; symlinked output files are refused. This is not protection against a concurrent malicious local process swapping files.
- Search and status filters are browser-tested, including hiding nonmatching cards and showing an empty state.

## License

MIT

## Release verification

Use a supported Node LTS (22 or 24). Run `npm ci --ignore-scripts` followed by `npm run verify`. The security workflow runs the regression suite on Linux and Windows; it has not yet been executed remotely for this local change. New report/output files are created exclusively; choose fresh filenames or output folders for repeat runs. See [SECURITY.md](SECURITY.md) for the threat model and disclosure guidance.
