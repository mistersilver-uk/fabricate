/**
 * Core mixin factory for Svelte-based ApplicationV2 windows.
 *
 * Separated from the .svelte.js wrapper so it can be imported in plain Node
 * test environments without requiring Svelte compiler support.
 *
 * @param {typeof import('foundry').applications.api.ApplicationV2} Base
 * @param {{ createReactiveProps: (initial: object) => object, mountFn: Function, unmountFn: Function }} deps
 */
export function createSvelteApplicationMixin(Base, { createReactiveProps, mountFn, unmountFn }) {
  return class SvelteApplication extends Base {
    static SVELTE_COMPONENT = null;

    _svelteComponent = null;
    _svelteTarget = null;
    _svelteProps = null;
    _svelteMounted = false;

    async _renderHTML(context, options) {
      const props = this._prepareSvelteProps(context);
      if (!this._svelteMounted) {
        this._svelteProps = createReactiveProps({ ...props });
      } else {
        Object.assign(this._svelteProps, props);
      }
      return this._svelteProps;
    }

    // ApplicationV2 uses a two-phase render pipeline:
    //   1. _renderHTML  — prepares data (context / props); no DOM work.
    //   2. _replaceHTML — handles DOM insertion into the window content area.
    //
    // Svelte's mount() must be called here (phase 2), not in _renderHTML,
    // because the target element only exists and is safe to write into during
    // the DOM-insertion phase.  On subsequent renders the props object is
    // already reactive, so no re-mount is needed.
    _replaceHTML(result, content, options) {
      if (!this._svelteMounted) {
        const Component = this.constructor.SVELTE_COMPONENT;
        if (!Component) {
          throw new Error(
            `${this.constructor.name} must define static SVELTE_COMPONENT`
          );
        }
        this._svelteTarget = content;
        this._svelteComponent = mountFn(Component, {
          target: content,
          props: this._svelteProps
        });
        this._svelteMounted = true;
      }
      // Re-renders: props already updated reactively via Object.assign in _renderHTML.
    }

    _prepareSvelteProps(context) {
      return context;
    }

    updateProps(newProps) {
      if (!this._svelteMounted || !this._svelteProps) {
        return;
      }
      Object.assign(this._svelteProps, newProps);
    }

    /** Shared teardown used by both close() and _onClose(). */
    _unmountSvelte() {
      if (this._svelteMounted && this._svelteComponent) {
        unmountFn(this._svelteComponent);
        this._svelteComponent = null;
        this._svelteProps = null;
        this._svelteTarget = null;
        this._svelteMounted = false;
      }
    }

    async close(options) {
      this._unmountSvelte();
      return super.close(options);
    }

    /**
     * Safety-net hook called by ApplicationV2 after the window element is
     * removed from the DOM (e.g. when Foundry closes the window via a path
     * that does not go through close()).  We unmount the Svelte component here
     * to avoid leaking it.  _unmountSvelte() is idempotent so calling it from
     * both close() and _onClose() never double-unmounts.
     */
    _onClose(options) {
      this._unmountSvelte();
      if (typeof super._onClose === 'function') {
        super._onClose(options);
      }
    }

    /**
     * Called by ApplicationV2 after every render cycle.  No Svelte-specific
     * work is needed here — mounting is done in _replaceHTML and prop updates
     * are reactive — but we forward to super so subclasses and the base class
     * can still attach event listeners or perform post-render DOM queries.
     */
    _onRender(context, options) {
      if (typeof super._onRender === 'function') {
        super._onRender(context, options);
      }
    }

    _onPosition(pos) {
      if (typeof super._onPosition === 'function') {
        super._onPosition(pos);
      }
      if (
        this._svelteProps?.onResize &&
        typeof this._svelteProps.onResize === 'function'
      ) {
        this._svelteProps.onResize({ width: pos.width, height: pos.height });
      }
    }
  };
}
