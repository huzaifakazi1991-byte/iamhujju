# Repo triage team

A multi-agent triage team for [huzaifakazi1991-byte/iamhujju](https://github.com/huzaifakazi1991-byte/iamhujju),
built with the [Mistral Agents SDK](https://docs.mistral.ai). A lead agent starts three specialist
subagents in parallel, each working on its own GitHub task, and combines their results into one
triage report:

| Subagent | Job |
| --- | --- |
| `issue_triager` | Classifies every open issue by type, severity, staleness, and blocks. |
| `pr_reviewer` | Summarizes each open pull request: scope, size, review and CI state, risk. |
| `repo_health_analyst` | Assesses activity, maintenance debt, and recurring themes. |

GitHub access comes through the `github_app` connector, so every run acts as the signed-in user.

## Local development

```sh
uv sync
uv run agents info
uv run agents chat
uv run python main.py "Review only the pull requests."
```

The last command runs one session with a custom prompt and prints the report;
when GitHub access is not connected yet it lists the sign-in it is waiting on
instead of failing silently.

## Deployment

Deployed as a Studio managed workflow deployment named `repo-triage-team`, built from this
directory (`build_directory=agents/triage`, hardened, because the agent uses on-behalf-of
connector identity). Redeploy after pushing a new commit to the deployment's revision.
