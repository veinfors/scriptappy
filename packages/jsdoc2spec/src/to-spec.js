const fs = require('fs');
const winston = require('winston');
const types = require('./types');

function filterDoclets(data) {
  return data().get().filter(doc => !doc.undocumented && !doc.ignore);
}

function collect(doclets, cfg) {
  const ids = {};
  const priv = {};
  let pack;

  doclets.forEach(doc => {
    let d;
    if (doc.meta && doc.meta.code.name === 'module.exports') {
      if (doc.longname.indexOf('module.exports') === 0) {
        cfg.logger.warn('Default export without module name:', `${doc.meta.path}/${doc.meta.filename}`);
        return;
      }
    }
    // class
    // constant
    // event
    // external
    // file
    // function
    // member
    // mixin
    // module
    // namespace
    // typedef
    switch (doc.kind) {
      case 'package':
        pack = doc;
        break;
      case 'typedef':
      case 'member':
      case 'constant':
      case 'module':
      case 'function':
      case 'event':
      case 'namespace':
      case 'class':
      case 'interface':
        d = types.doclet(doc, cfg);
        break;
      default:
        cfg.logger.warn('Untreated kind:', doc.kind);
        break;
    }

    if (d) {
      d.__id = doc.longname;
      d.__scopeName = doc.name;
      d.__memberOf = doc.memberof;
      d.__memberScope = doc.scope;
      d.__meta = doc.meta;
      d.__access = doc.access;
      d.__isDefinition = (doc.tags || []).filter(tag => tag.originalTitle === 'definition').length > 0;

      if (ids[d.__id] && ids[d.__id].kind === 'module') { // 'd' is a default export from a module
        d.__memberOf = d.__id;
        d.__memberScope = 'static';
        d.__scopeName = '@default';
        d.__id += '@default';
      }
      // TODO - check if id already exists and do something about it
      // (in order to support e.g. multiple method signatures)
      ids[d.__id] = {};
      priv[d.__id] = {};
      Object.keys(d).forEach(key => {
        if (/^__/.test(key)) {
          priv[d.__id][key] = d[key];
        } else {
          ids[d.__id][key] = d[key];
        }
      });
    }
  });

  return {
    pack,
    ids,
    priv,
  };
}

function transform({ ids, priv }, cfg) {
  const entries = {};
  const definitions = {};
  Object.keys(ids).forEach(longname => {
    const d = ids[longname];
    const pr = priv[longname];
    const memberOf = pr.__memberOf;
    const memberDefault = `${memberOf}@default`;
    const memberScope = pr.__memberScope;
    const scopeName = pr.__scopeName;
    let parent = ids[memberOf];
    const access = pr.__access;
    const isDefinition = pr.__isDefinition;

    const parentMaybeDefault = ids[memberDefault];
    if (/^module:/.test(memberOf) && parentMaybeDefault && parentMaybeDefault !== d) {
      if (!/^exports/.test(pr.__meta.code.name)) {
        parent = ids[memberDefault];
        pr.__id = pr.__id.replace(memberOf, memberDefault);
      }
    }

    let memberProperty;

    if (access === 'private') {
      return;
    }

    if (parent) {
      if (d.kind === 'event') {
        memberProperty = 'events';
      } else if (memberScope === 'static' && parent && parent.kind === 'class') {
        memberProperty = 'staticEntries';
      } else if (memberScope === 'static' && parent && parent.kind === 'module') {
        memberProperty = 'entries';
      } else if (memberScope === 'inner' || isDefinition) {
        memberProperty = 'definitions';
      } else {
        memberProperty = 'entries';
      }

      if (memberProperty && parent) {
        parent[memberProperty] = parent[memberProperty] || {};
        if (parent[memberProperty][scopeName]) {
          cfg.logger.verbose('exists?', longname, scopeName, parent[memberProperty][scopeName]);
        }
        parent[memberProperty][scopeName] = d;
      }
    } else if (memberScope === 'inner' || isDefinition) {
      definitions[pr.__id] = d;
    } else {
      entries[pr.__id] = d;
    }
  });

  return {
    entries,
    definitions,
  };
}

function specification({ entries = {}, definitions = {}, pack = {} } = {}, opts) {
  const spec = {
    spec: {
      version: '0.1.0',
    },
    info: {
      name: typeof opts.name !== 'undefined' ? opts.name : pack.name,
      description: typeof opts.description !== 'undefined' ? opts.description : pack.description,
      version: typeof opts.version !== 'undefined' ? opts.version : pack.version,
      license: typeof opts.license !== 'undefined' ? opts.license : (pack.licenses ? pack.licenses[0].type : undefined), // eslint-disable-line
    },
    entries,
    definitions,
  };

  return JSON.stringify(spec, null, 2);
}

function write(JSONSpec, destination) {
  fs.writeFileSync(destination, JSONSpec);
}

function generate({
  taffydata,
  jsdocopts,
  opts,
}) {
  // filter doclets
  const doclets = filterDoclets(taffydata);

  // collect doclets based on longname
  const collected = collect(doclets, opts);

  // transform
  const { entries, definitions } = transform(collected, opts);

  // create spec
  const spec = specification({
    entries,
    definitions,
    pack: collected.pack,
  }, opts);

  // validate spec against schema
  // validateSpec(JSON.parse(JSONSpec), schema);

  // write
  write(spec, jsdocopts.destination);
}

const wlogger = new winston.Logger({
  level: 'info',
  transports: [
    new winston.transports.Console({
      colorize: true,
      prettyPrint: true,
    }),
  ],
});

function jsdocpublish(taffydata, jsdocopts) {
  const opts = {
    stability: {},
    logger: wlogger,
  };
  generate({
    taffydata,
    jsdocopts,
    opts,
  });
}

module.exports = {
  filterDoclets,
  collect,
  generate,
  jsdocpublish,
};