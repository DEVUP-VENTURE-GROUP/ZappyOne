// Lets plain Node load the shared screen code, whose imports leave off ".js" the way the website bundler allows.
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' && /^\.{1,2}\//.test(spec) && !/\.[cm]?js$/.test(spec)) return next(`${spec}.js`, ctx);
    throw err;
  }
}
