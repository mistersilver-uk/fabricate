/**
 * The persistence seam for recipes and crafting systems (issue 1089), so a backend change is one
 * adapter; `docs/technical/adr/0001-granular-crafting-definition-persistence.md` records the
 * backend constraints. `get` and `listSummaries` are asynchronous and take an id or a query, so a
 * document backend need not hold the corpus. It gates nothing: every `_assertGM` stays put.
 */

/** Abstract; every method throws, so a silently empty read never passes for "nothing to do". */
export class CraftingDefinitionRepository {
  async loadAll() {
    throw new Error(`${this.constructor.name} must implement loadAll()`);
  }

  async get(id) {
    throw new Error(`${this.constructor.name} must implement get(${id})`);
  }

  async listSummaries(_query) {
    throw new Error(`${this.constructor.name} must implement listSummaries()`);
  }

  async put(_record) {
    throw new Error(`${this.constructor.name} must implement put()`);
  }

  /** Removing an absent id is not an error. */
  async delete(id) {
    throw new Error(`${this.constructor.name} must implement delete(${id})`);
  }

  /** Replace the whole corpus: settings-shaped, and what the managers' `save()` falls back to. */
  async putAll(_records) {
    throw new Error(`${this.constructor.name} must implement putAll()`);
  }

  /**
   * Coalesce every `put`/`delete` inside `work`, nested batches included, into one flush when the
   * outermost batch completes. A throw still flushes, since memory already moved; which error wins
   * when the flush fails too is adapter-specific (the settings adapter's flush rejection wins).
   */
  async runBatch(_work) {
    throw new Error(`${this.constructor.name} must implement runBatch()`);
  }

  /**
   * Optional and synchronous, since the managers' `reload()` runs from `updateSetting`: the corpus
   * a replication event delivered, or `null` from a backend with no synchronous snapshot (a pack
   * write on 14.365 reaches only clients that loaded the document, issue 1088).
   */
  readReplicatedSnapshot() {
    return null;
  }
}

/**
 * Dispatch one `{ put }`, `{ delete }` or `{ batch }` change onto a repository, else write the
 * whole corpus. Both managers' `save()` call it; `save()` stays the seam test doubles replace.
 */
export async function applyDefinitionChange(repository, change, corpus) {
  if (change?.put) {
    await repository.put(change.put);
    return;
  }
  if (change?.delete) {
    await repository.delete(change.delete);
    return;
  }
  if (change?.batch) {
    await repository.runBatch(async () => {
      for (const record of change.batch) {
        await repository.put(record);
      }
    });
    return;
  }
  await repository.putAll(corpus);
}
