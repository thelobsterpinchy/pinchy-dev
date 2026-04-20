# services/agent-worker

Long-lived autonomous worker runtime.

Core loops:
- receive task/run
- plan next action
- select tool or model
- execute with policy checks
- persist result
- continue until completion or approval wait

Initial tools:
- filesystem read/write/edit
- shell
- git
- browser automation
- screenshot
- HTTP fetch
- search/index
