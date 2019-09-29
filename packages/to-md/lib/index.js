const traverse = require('./traverse');
const entryFn = require('./entry');
const typesFn = require('./types');

function toMarkdown(spec) {
  const toc = [];
  const types = typesFn(spec);

  const addToToc = (s) => {
    toc.push(s);
  };

  const content = traverse(spec, {
    parent: null,
    depth: 0,
    indent: 0,
  }, {
    traverse,
    entry: entryFn,
    addToToc,
    getType: types.getType,
    assignSlug: types.assignSlug,
  });

  return {
    toc: () => toc.join('\n'),
    content: () => content,
    references: () => types.getReferences().map(ref => `[${ref.key}]: ${ref.link}`).join('\n'),
  };
}

module.exports = toMarkdown;
