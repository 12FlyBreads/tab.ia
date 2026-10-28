export function TabViewer({ tab }: { tab: string }) {
  return <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
    <p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">Resultado final</p>
    <h2 className="mt-2 text-xl font-semibold">Tablatura gerada</h2>
    <pre className="mt-5 overflow-x-auto rounded-xl bg-slate-950 p-5 font-mono text-sm leading-7 text-emerald-200">{tab}</pre>
  </section>;
}
