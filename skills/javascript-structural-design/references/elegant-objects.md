# Elegant Objects Notes

Source direction:

- `https://www.elegantobjects.org/`
- Yegor Bugayenko, `Seven Virtues of a Good Object`
- Yegor Bugayenko, `Printers Instead of Getters`

## Useful Principles For Fabricate

### Behavior Before Data Plumbing

- Prefer objects or modules that own behavior instead of exposing internal state for outside orchestration.
- Reach for representation-producing methods only when the representation is part of the boundary.
- Getter-heavy APIs are a smell when they turn a unit into a passive data bag.

### Small, Cohesive Units

- A good unit has one clear reason to change.
- If the best description of a file, class, or module uses "and", the design is probably overloaded.
- Split responsibilities before adding more conditionals or mode flags.

### Explicit Contracts And Composition

- Public behavior should have a clear contract.
- Prefer composing narrow collaborators over inheritance hierarchies or broad utility surfaces.
- In JavaScript, exported module APIs are the contract. Keep them small and intention-revealing.

### Avoid Static And Global Utility Thinking

- The strict EO rule is "no static methods." The practical Fabricate translation is: do not hide behavior in global mutable helpers or generic utility buckets.
- Private pure helpers inside one module are fine.
- Shared exported helpers should exist only when they express a real abstraction with a stable contract.

### Prefer Stable State

- Favor immutable inputs, final configuration, and narrow mutation zones.
- Mutation is less risky when it is local, explicit, and easy to observe in tests.

### Name Things By What They Are

- Avoid job-title names like `Reader`, `Parser`, `Manager`, or `Service` unless the domain genuinely calls for them.
- Favor names that reveal the owned concept or boundary, not vague operational intent.

## Adaptation Notes

- Fabricate uses ES modules, functions, Svelte stores, and Foundry globals at runtime edges. Do not force everything into classes.
- The point is explicit ownership, low surprise, and decomposable seams, not ideological purity.
