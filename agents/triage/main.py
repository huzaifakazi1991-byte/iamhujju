import sys

from mistralai import agents

DEFAULT_REPO = "huzaifakazi1991-byte/iamhujju"

LEAD_INSTRUCTIONS = (
    "You lead a triage team for the GitHub repository "
    f"{DEFAULT_REPO}, unless the caller names another owner/repository.\n"
    "When asked to triage, start all three specialists in the same turn so they run in parallel: "
    "one issue_triager, one pr_reviewer and one repo_health_analyst. Put everything each "
    "specialist needs in its task, including the full repository name and any focus the caller "
    "asked for. Wait for every result before you answer; never report before all specialists "
    "have returned.\n"
    "Then write one triage report in Markdown with: a short status per specialist, the top "
    "priorities across issues and pull requests (each with number and link), recommended next "
    "actions, and anything the specialists could not confirm. If the caller asks for a narrow "
    "review, start only the relevant specialists."
)

ISSUE_TRIAGER_INSTRUCTIONS = (
    "Work on the GitHub repository named in your task. Use the github_app connector tools to "
    "list the open issues and read their details.\n"
    "Classify each open issue: type (bug, feature, question, chore), severity (blocker, high, "
    "medium, low), and whether it is stale or blocked. Group duplicates and point out the "
    "comments worth reading first. End with a ranked list of the issues that need attention "
    "first; every item carries its issue number and a link. Report only what the tools confirm "
    "about each issue's actual state."
)

PR_REVIEWER_INSTRUCTIONS = (
    "Work on the GitHub repository named in your task. Use the github_app connector tools to "
    "list the open pull requests and read their details.\n"
    "For each open pull request summarize what it changes, its size, its review and CI state, "
    "and its risk. Flag pull requests that need the author's attention, are conflicting, stale, "
    "unreviewed, or failing checks. End with a ranked list of the pull requests to merge or fix "
    "first; every item carries its number and a link."
)

REPO_HEALTH_INSTRUCTIONS = (
    "Work on the GitHub repository named in your task. Use the github_app connector tools to "
    "assess the repository's health: recent activity, open versus closed work, stale branches, "
    "unanswered maintainer questions, missing labels or milestones, and recurring themes in "
    "closed issues that resurface.\n"
    "Keep to what the tools confirm and say unknown when they cannot answer. End with the three "
    "health risks that most need addressing, each backed by evidence from the repository."
)

agent = agents.Agent(
    name="repo-triage-team",
    model="mistral-large-4",
    instructions=LEAD_INSTRUCTIONS,
    connectors=[agents.connector("github_app")],
    subagents=[
        agents.Subagent(
            name="issue_triager",
            description="Reads every open issue of one GitHub repository and triages them by priority.",
            instructions=ISSUE_TRIAGER_INSTRUCTIONS,
            builtins=agents.Builtins(subagents=False),
        ),
        agents.Subagent(
            name="pr_reviewer",
            description="Reads every open pull request of one GitHub repository and reviews their state.",
            instructions=PR_REVIEWER_INSTRUCTIONS,
            builtins=agents.Builtins(subagents=False),
        ),
        agents.Subagent(
            name="repo_health_analyst",
            description="Assesses the overall state of one GitHub repository: activity, debt, and hygiene.",
            instructions=REPO_HEALTH_INSTRUCTIONS,
            builtins=agents.Builtins(subagents=False),
        ),
    ],
)


def describe_callback(callback: agents.ApprovalRequest | agents.OpenSignIn) -> str:
    kind = type(callback).__name__
    name = getattr(callback, "name", None) or getattr(callback, "connector", None) or ""
    return f"{kind} {name}".strip()


async def main() -> None:
    prompt = " ".join(sys.argv[1:]).strip() or "Triage the repository."
    session = await agent.start_session()
    state = await session.run(prompt)
    if isinstance(state, agents.Completed):
        print(state.text)
    elif isinstance(state, agents.Blocked):
        print(state.text or "The turn is blocked, waiting on callbacks.")
        for callback in state.callbacks:
            print(f"- waiting on: {describe_callback(callback)}")
        print("Connect the connector on Mistral Studio, then rerun or answer the callback.")
    else:
        print(state.text or f"The turn ended with {type(state).__name__}.")
    await session.cancel()


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
