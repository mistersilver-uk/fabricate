# Testable Code Notes

Source direction:

- `https://github.com/mhevery/guide-to-testable-code`

Use these as smell detectors for code that is hard to change or test.

## Constructor Does Real Work

Warning signs:

- object creation performs I/O, branching setup, service lookup, or heavy graph construction
- constructors or init methods contain control flow beyond cheap validation and assignment
- field initializers or static setup perform hidden work

Preferred move:

- Keep constructors and factories boring.
- Move expensive or environment-dependent work to the composition edge or an explicit method.

## Digging Into Collaborators

Warning signs:

- a dependency is passed in only so the code can fetch something else from it
- call chains walk an object graph through multiple dots
- parameters are named `context`, `environment`, `container`, `manager`, or similar grab bags

Preferred move:

- Inject the specific collaborator you actually need.
- Ask for the dependency directly instead of reaching through another object to find it.

## Brittle Global State And Singletons

Warning signs:

- hidden mutable module state
- singleton access, registries, or service locators
- static initialization that changes behavior for the whole process
- tests that depend on execution order or explicit global reset

Preferred move:

- Make dependencies explicit.
- Wrap unavoidable third-party statics or globals in thin adapters that tests can replace.

## Class Or Module Does Too Much

Warning signs:

- the best description contains "and"
- fields are only used by some methods
- unrelated responsibilities share one stateful unit
- collaborators are dumb because one class coordinates everything

Preferred move:

- Split by responsibility.
- Extract the smallest concept that lets each unit own one reason to change.
- In legacy code, sprout a new unit around the new behavior instead of enlarging the god object.

## Testing Implications

- Good seams let tests verify behavior without mocks returning mocks.
- You should rarely need to mock getters or setters.
- If the setup for one test is surprisingly hard, the production boundary is probably wrong.
