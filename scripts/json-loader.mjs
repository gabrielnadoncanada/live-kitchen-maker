// Loader Node pour le test de fumée : webpack accepte `import x from './x.json'`
// sans attribut, Node l'exige — on l'injecte ici.
export async function load(url, context, next) {
  if (url.endsWith('.json')) {
    return next(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
  }
  return next(url, context);
}
