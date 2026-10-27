const OLD_HOST = "greenlens.pages.dev";
const NEW_ORIGIN = "https://greenlens.stoaops.com";

// Sends the old Pages host to the stoaops.com domain with a 308, keeping the
// path and query. Preview deployments (*.greenlens.pages.dev) are left alone.
export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  if (url.hostname !== OLD_HOST) return context.next();

  return Response.redirect(`${NEW_ORIGIN}${url.pathname}${url.search}`, 308);
};
