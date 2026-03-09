# Prompt Library

## Next Task

```text
Use the orchestrator agent to query GitHub Issues for the next open unblocked task,
delegate it to the implementer agent, then once complete pass the result
to the reviewer agent, then if accepted, pass the result to the docs writer agent,
and finally close the GitHub Issue with a resolution comment.
```

## Next Tasks (Parallel)

```text
Create three teams of orchestrator, implementer, reviewer and docs writer agents. Query GitHub Issues
to find the next open task that is unblocked, with no dependencies, without the triage label, and 
ideally does not require editing the same files as any other in-progress issue. Hand the task to each 
teams' orchestrator, and task it with creating a plan to implement the task, which you should then 
hand to the teams' implementer agent. Once implementation is complete, pass the result to the teams'
reviewer agent. If not accepted, the implementer must iterate further on the solution before it is 
passed back to the reviewer. If accepted, pass the result to the docs writer agent and finally close
the GitHub Issue.
```
