// What customers see for a pro's track record: "New" until 10 finished jobs, then the count. Websites and apps alike.
export const SHOW_FROM = 10;

export const isNewPro = (n) => !(Number(n) >= SHOW_FROM);

/** "New" or "1,240 jobs done". */
export const jobsDoneLabel = (n, word = 'jobs done') => (isNewPro(n) ? 'New' : `${Number(n).toLocaleString('en-IN')} ${word}`);
