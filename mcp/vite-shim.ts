// `src/audio` imports its worklet as `./tap.worklet.ts?worker&url`, which only Vite resolves. Under Bun that import
// has no default export, so loading `src/station/runner.ts` fails. This Bun plugin loads any `?worker&url` import as
// an empty string (the headless replay never starts a worklet). Import this module before `mcp/replay.ts` is loaded,
// and load `replay.ts` with a dynamic `import()` afterwards.
interface BunPluginBuilder {
  onLoad(options: { filter: RegExp }, load: () => { contents: string; loader: 'js' }): void;
}
interface BunRuntime {
  plugin(plugin: { name: string; setup(build: BunPluginBuilder): void }): void;
}

const bun = (globalThis as { Bun?: BunRuntime }).Bun;
if (!bun) throw new Error('banshee-log runs under Bun: start it with `bun run mcp:banshee-log`.');

bun.plugin({
  name: 'banshee-vite-worker-url',
  setup(build) {
    build.onLoad({ filter: /\?worker&url$/ }, () => ({ contents: 'export default "";', loader: 'js' }));
  },
});

export {};
