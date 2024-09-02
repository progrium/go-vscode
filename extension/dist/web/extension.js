"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/web/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));

// src/web/hostfs.ts
var import_vscode = require("vscode");
var File = class {
  constructor(uri, entry) {
    this.uri = uri;
    this.type = import_vscode.FileType.File;
    this.ctime = 0;
    this.mtime = entry.Mtime;
    this.size = entry.Size;
    this.name = entry.Name;
  }
};
var Directory = class {
  constructor(uri, entry) {
    this.uri = uri;
    this.type = import_vscode.FileType.Directory;
    this.ctime = 0;
    this.mtime = entry.Mtime;
    this.size = entry.Size;
    this.name = entry.Name;
  }
};
var HostFS = class _HostFS {
  constructor(peer) {
    // --- manage file events
    this._emitter = new import_vscode.EventEmitter();
    this._bufferedEvents = [];
    this.onDidChangeFile = this._emitter.event;
    this.peer = peer;
    this.disposable = import_vscode.Disposable.from(
      import_vscode.workspace.registerFileSystemProvider(_HostFS.scheme, this, { isCaseSensitive: true })
      // workspace.registerFileSearchProvider(MemFS.scheme, this),
      // workspace.registerTextSearchProvider(MemFS.scheme, this)
    );
  }
  static {
    this.scheme = "hostfs";
  }
  dispose() {
    this.disposable?.dispose();
  }
  // root = new Directory(Uri.parse('memfs:/'), '');
  // --- manage file metadata
  stat(uri) {
    return new Promise((resolve, reject) => {
      this._lookup(uri, false).then(resolve, reject);
    });
  }
  readDirectory(uri) {
    return new Promise(async (resolve, reject) => {
      try {
        const resp = await this.peer.call("vscode.ReadDir", [uri.path]);
        let result = [];
        for (const entry of resp.value) {
          result.push([entry.Name, entry.IsDir ? import_vscode.FileType.Directory : import_vscode.FileType.File]);
        }
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
  }
  // --- manage file contents
  readFile(uri) {
    return new Promise(async (resolve, reject) => {
      try {
        const resp = await this.peer.call("vscode.ReadFile", [uri.path]);
        resolve(resp.value);
      } catch (e) {
        reject(import_vscode.FileSystemError.FileNotFound());
      }
    });
  }
  writeFile(uri, content, options) {
    return new Promise(async (resolve, reject) => {
      let entry = await this._lookup(uri, true);
      if (entry instanceof Directory) {
        reject(import_vscode.FileSystemError.FileIsADirectory(uri));
      }
      if (!entry && !options.create) {
        reject(import_vscode.FileSystemError.FileNotFound(uri));
      }
      if (entry && options.create && !options.overwrite) {
        reject(import_vscode.FileSystemError.FileExists(uri));
      }
      try {
        await this.peer.call("vscode.WriteFile", [uri.path, content]);
      } catch (e) {
        reject(e);
      }
      if (!entry) {
        this._fireSoon({ type: import_vscode.FileChangeType.Created, uri });
      }
      this._fireSoon({ type: import_vscode.FileChangeType.Changed, uri });
      resolve();
    });
  }
  // --- manage files/folders
  copy(source, destination, options) {
    return new Promise(async (resolve, reject) => {
      reject("not implemented");
    });
  }
  rename(oldUri, newUri, options) {
    return new Promise(async (resolve, reject) => {
      if (!options.overwrite && await this._lookup(newUri, true)) {
        reject(import_vscode.FileSystemError.FileExists(newUri));
      }
      let entry = await this._lookup(oldUri, false);
      let oldParent = await this._lookupParentDirectory(oldUri);
      let newParent = await this._lookupParentDirectory(newUri);
      let newName = this._basename(newUri.path);
      this._fireSoon(
        { type: import_vscode.FileChangeType.Deleted, uri: oldUri },
        { type: import_vscode.FileChangeType.Created, uri: newUri }
      );
      resolve();
    });
  }
  delete(uri, options) {
    return new Promise(async (resolve, reject) => {
      let dirname = uri.with({ path: this._dirname(uri.path) });
      this._fireSoon({ type: import_vscode.FileChangeType.Changed, uri: dirname }, { uri, type: import_vscode.FileChangeType.Deleted });
      resolve();
    });
  }
  createDirectory(uri) {
    return new Promise(async (resolve, reject) => {
      let dirname = uri.with({ path: this._dirname(uri.path) });
      try {
        await this.peer.call("vscode.MakeDir", [uri.path]);
      } catch (e) {
        reject(e);
      }
      this._fireSoon({ type: import_vscode.FileChangeType.Changed, uri: dirname }, { type: import_vscode.FileChangeType.Created, uri });
      resolve();
    });
  }
  async _lookup(uri, silent) {
    try {
      const resp = await this.peer.call("vscode.Stat", [uri.path]);
      const entry = resp.value;
      if (entry.IsDir) {
        return new Directory(uri, entry);
      } else {
        return new File(uri, entry);
      }
    } catch (e) {
      if (!silent) {
        throw import_vscode.FileSystemError.FileNotFound(uri);
      } else {
        return void 0;
      }
    }
  }
  async _lookupAsDirectory(uri, silent) {
    let entry = await this._lookup(uri, silent);
    if (entry instanceof Directory) {
      return entry;
    }
    throw import_vscode.FileSystemError.FileNotADirectory(uri);
  }
  async _lookupAsFile(uri, silent) {
    let entry = await this._lookup(uri, silent);
    if (entry instanceof File) {
      return entry;
    }
    throw import_vscode.FileSystemError.FileIsADirectory(uri);
  }
  async _lookupParentDirectory(uri) {
    const dirname = uri.with({ path: this._dirname(uri.path) });
    return await this._lookupAsDirectory(dirname, false);
  }
  watch(_resource) {
    return new import_vscode.Disposable(() => {
    });
  }
  _fireSoon(...events) {
    this._bufferedEvents.push(...events);
    if (this._fireSoonHandle) {
      clearTimeout(this._fireSoonHandle);
    }
    this._fireSoonHandle = setTimeout(() => {
      this._emitter.fire(this._bufferedEvents);
      this._bufferedEvents.length = 0;
    }, 5);
  }
  // --- path utils
  _basename(path) {
    path = this._rtrim(path, "/");
    if (!path) {
      return "";
    }
    return path.substr(path.lastIndexOf("/") + 1);
  }
  _dirname(path) {
    path = this._rtrim(path, "/");
    if (!path) {
      return "/";
    }
    return path.substr(0, path.lastIndexOf("/"));
  }
  _rtrim(haystack, needle) {
    if (!haystack || !needle) {
      return haystack;
    }
    const needleLen = needle.length, haystackLen = haystack.length;
    if (needleLen === 0 || haystackLen === 0) {
      return haystack;
    }
    let offset = haystackLen, idx = -1;
    while (true) {
      idx = haystack.lastIndexOf(needle, offset - 1);
      if (idx === -1 || idx + needleLen !== offset) {
        break;
      }
      if (idx === 0) {
        return "";
      }
      offset = idx;
    }
    return haystack.substring(0, offset);
  }
};

// src/duplex/duplex.min.js
var hr = Object.defineProperty;
var yr = (t2, e) => {
  for (var r in e) hr(t2, r, { get: e[r], enumerable: true });
};
var it;
try {
  it = new TextDecoder();
} catch {
}
var p;
var ee;
var f = 0;
var $t = [];
var pr = 105;
var mr = 57342;
var xr = 57343;
var Nt = 57337;
var Ht = 6;
var ae = {};
var ot = $t;
var at = 0;
var U = {};
var O;
var Pe;
var ke = 0;
var ge = 0;
var R;
var H;
var M = [];
var ct = [];
var T;
var V;
var we;
var jt = { useRecords: false, mapsAsObjects: true };
var be = false;
var te = class t {
  constructor(e) {
    if (e && ((e.keyMap || e._keyMap) && !e.useRecords && (e.useRecords = false, e.mapsAsObjects = true), e.useRecords === false && e.mapsAsObjects === void 0 && (e.mapsAsObjects = true), e.getStructures && (e.getShared = e.getStructures), e.getShared && !e.structures && ((e.structures = []).uninitialized = true), e.keyMap)) {
      this.mapKey = /* @__PURE__ */ new Map();
      for (let [r, n] of Object.entries(e.keyMap)) this.mapKey.set(n, r);
    }
    Object.assign(this, e);
  }
  decodeKey(e) {
    return this.keyMap && this.mapKey.get(e) || e;
  }
  encodeKey(e) {
    return this.keyMap && this.keyMap.hasOwnProperty(e) ? this.keyMap[e] : e;
  }
  encodeKeys(e) {
    if (!this._keyMap) return e;
    let r = /* @__PURE__ */ new Map();
    for (let [n, s] of Object.entries(e)) r.set(this._keyMap.hasOwnProperty(n) ? this._keyMap[n] : n, s);
    return r;
  }
  decodeKeys(e) {
    if (!this._keyMap || e.constructor.name != "Map") return e;
    if (!this._mapKey) {
      this._mapKey = /* @__PURE__ */ new Map();
      for (let [n, s] of Object.entries(this._keyMap)) this._mapKey.set(s, n);
    }
    let r = {};
    return e.forEach((n, s) => r[v(this._mapKey.has(s) ? this._mapKey.get(s) : s)] = n), r;
  }
  mapDecode(e, r) {
    let n = this.decode(e);
    if (this._keyMap) switch (n.constructor.name) {
      case "Array":
        return n.map((s) => this.decodeKeys(s));
    }
    return n;
  }
  decode(e, r) {
    if (p) return Xt(() => (Oe(), this ? this.decode(e, r) : t.prototype.decode.call(jt, e, r)));
    ee = r > -1 ? r : e.length, f = 0, at = 0, ge = 0, Pe = null, ot = $t, R = null, p = e;
    try {
      V = e.dataView || (e.dataView = new DataView(e.buffer, e.byteOffset, e.byteLength));
    } catch (n) {
      throw p = null, e instanceof Uint8Array ? n : new Error("Source must be a Uint8Array or Buffer but was a " + (e && typeof e == "object" ? e.constructor.name : typeof e));
    }
    if (this instanceof t) {
      if (U = this, T = this.sharedValues && (this.pack ? new Array(this.maxPrivatePackedValues || 16).concat(this.sharedValues) : this.sharedValues), this.structures) return O = this.structures, Se();
      (!O || O.length > 0) && (O = []);
    } else U = jt, (!O || O.length > 0) && (O = []), T = null;
    return Se();
  }
  decodeMultiple(e, r) {
    let n, s = 0;
    try {
      let o = e.length;
      be = true;
      let l = this ? this.decode(e, o) : ht.decode(e, o);
      if (r) {
        if (r(l) === false) return;
        for (; f < o; ) if (s = f, r(Se()) === false) return;
      } else {
        for (n = [l]; f < o; ) s = f, n.push(Se());
        return n;
      }
    } catch (o) {
      throw o.lastPosition = s, o.values = n, o;
    } finally {
      be = false, Oe();
    }
  }
};
function Se() {
  try {
    let t2 = D();
    if (R) {
      if (f >= R.postBundlePosition) {
        let e = new Error("Unexpected bundle position");
        throw e.incomplete = true, e;
      }
      f = R.postBundlePosition, R = null;
    }
    if (f == ee) O = null, p = null, H && (H = null);
    else if (f > ee) {
      let e = new Error("Unexpected end of CBOR data");
      throw e.incomplete = true, e;
    } else if (!be) throw new Error("Data read, but end of buffer not reached");
    return t2;
  } catch (t2) {
    throw Oe(), (t2 instanceof RangeError || t2.message.startsWith("Unexpected end of buffer")) && (t2.incomplete = true), t2;
  }
}
function D() {
  let t2 = p[f++], e = t2 >> 5;
  if (t2 = t2 & 31, t2 > 23) switch (t2) {
    case 24:
      t2 = p[f++];
      break;
    case 25:
      if (e == 7) return Ir();
      t2 = V.getUint16(f), f += 2;
      break;
    case 26:
      if (e == 7) {
        let r = V.getFloat32(f);
        if (U.useFloat32 > 2) {
          let n = Me[(p[f] & 127) << 1 | p[f + 1] >> 7];
          return f += 4, (n * r + (r > 0 ? 0.5 : -0.5) >> 0) / n;
        }
        return f += 4, r;
      }
      t2 = V.getUint32(f), f += 4;
      break;
    case 27:
      if (e == 7) {
        let r = V.getFloat64(f);
        return f += 8, r;
      }
      if (e > 1) {
        if (V.getUint32(f) > 0) throw new Error("JavaScript does not support arrays, maps, or strings with length over 4294967295");
        t2 = V.getUint32(f + 4);
      } else U.int64AsNumber ? (t2 = V.getUint32(f) * 4294967296, t2 += V.getUint32(f + 4)) : t2 = V.getBigUint64(f);
      f += 8;
      break;
    case 31:
      switch (e) {
        case 2:
        case 3:
          throw new Error("Indefinite length not supported for byte or text strings");
        case 4:
          let r = [], n, s = 0;
          for (; (n = D()) != ae; ) r[s++] = n;
          return e == 4 ? r : e == 3 ? r.join("") : Buffer.concat(r);
        case 5:
          let o;
          if (U.mapsAsObjects) {
            let l = {};
            if (U.keyMap) for (; (o = D()) != ae; ) l[v(U.decodeKey(o))] = D();
            else for (; (o = D()) != ae; ) l[v(o)] = D();
            return l;
          } else {
            we && (U.mapsAsObjects = true, we = false);
            let l = /* @__PURE__ */ new Map();
            if (U.keyMap) for (; (o = D()) != ae; ) l.set(U.decodeKey(o), D());
            else for (; (o = D()) != ae; ) l.set(o, D());
            return l;
          }
        case 7:
          return ae;
        default:
          throw new Error("Invalid major type for indefinite length " + e);
      }
    default:
      throw new Error("Unknown token " + t2);
  }
  switch (e) {
    case 0:
      return t2;
    case 1:
      return ~t2;
    case 2:
      return br(t2);
    case 3:
      if (ge >= f) return Pe.slice(f - ke, (f += t2) - ke);
      if (ge == 0 && ee < 140 && t2 < 32) {
        let s = t2 < 16 ? Gt(t2) : gr(t2);
        if (s != null) return s;
      }
      return wr(t2);
    case 4:
      let r = new Array(t2);
      for (let s = 0; s < t2; s++) r[s] = D();
      return r;
    case 5:
      if (U.mapsAsObjects) {
        let s = {};
        if (U.keyMap) for (let o = 0; o < t2; o++) s[v(U.decodeKey(D()))] = D();
        else for (let o = 0; o < t2; o++) s[v(D())] = D();
        return s;
      } else {
        we && (U.mapsAsObjects = true, we = false);
        let s = /* @__PURE__ */ new Map();
        if (U.keyMap) for (let o = 0; o < t2; o++) s.set(U.decodeKey(D()), D());
        else for (let o = 0; o < t2; o++) s.set(D(), D());
        return s;
      }
    case 6:
      if (t2 >= Nt) {
        let s = O[t2 & 8191];
        if (s) return s.read || (s.read = lt(s)), s.read();
        if (t2 < 65536) {
          if (t2 == xr) {
            let o = le(), l = D(), m = D();
            dt(l, m);
            let g = {};
            if (U.keyMap) for (let x = 2; x < o; x++) {
              let k = U.decodeKey(m[x - 2]);
              g[v(k)] = D();
            }
            else for (let x = 2; x < o; x++) {
              let k = m[x - 2];
              g[v(k)] = D();
            }
            return g;
          } else if (t2 == mr) {
            let o = le(), l = D();
            for (let m = 2; m < o; m++) dt(l++, D());
            return D();
          } else if (t2 == Nt) return Cr();
          if (U.getShared && (ut(), s = O[t2 & 8191], s)) return s.read || (s.read = lt(s)), s.read();
        }
      }
      let n = M[t2];
      if (n) return n.handlesRead ? n(D) : n(D());
      {
        let s = D();
        for (let o = 0; o < ct.length; o++) {
          let l = ct[o](t2, s);
          if (l !== void 0) return l;
        }
        return new j(s, t2);
      }
    case 7:
      switch (t2) {
        case 20:
          return false;
        case 21:
          return true;
        case 22:
          return null;
        case 23:
          return;
        case 31:
        default:
          let s = (T || Q())[t2];
          if (s !== void 0) return s;
          throw new Error("Unknown token " + t2);
      }
    default:
      if (isNaN(t2)) {
        let s = new Error("Unexpected end of CBOR data");
        throw s.incomplete = true, s;
      }
      throw new Error("Unknown CBOR token " + t2);
  }
}
var Kt = /^[a-zA-Z_$][a-zA-Z\d_$]*$/;
function lt(t2) {
  function e() {
    let r = p[f++];
    if (r = r & 31, r > 23) switch (r) {
      case 24:
        r = p[f++];
        break;
      case 25:
        r = V.getUint16(f), f += 2;
        break;
      case 26:
        r = V.getUint32(f), f += 4;
        break;
      default:
        throw new Error("Expected array header, but got " + p[f - 1]);
    }
    let n = this.compiledReader;
    for (; n; ) {
      if (n.propertyCount === r) return n(D);
      n = n.next;
    }
    if (this.slowReads++ >= 3) {
      let o = this.length == r ? this : this.slice(0, r);
      return n = U.keyMap ? new Function("r", "return {" + o.map((l) => U.decodeKey(l)).map((l) => Kt.test(l) ? v(l) + ":r()" : "[" + JSON.stringify(l) + "]:r()").join(",") + "}") : new Function("r", "return {" + o.map((l) => Kt.test(l) ? v(l) + ":r()" : "[" + JSON.stringify(l) + "]:r()").join(",") + "}"), this.compiledReader && (n.next = this.compiledReader), n.propertyCount = r, this.compiledReader = n, n(D);
    }
    let s = {};
    if (U.keyMap) for (let o = 0; o < r; o++) s[v(U.decodeKey(this[o]))] = D();
    else for (let o = 0; o < r; o++) s[v(this[o])] = D();
    return s;
  }
  return t2.slowReads = 0, e;
}
function v(t2) {
  return t2 === "__proto__" ? "__proto_" : t2;
}
var wr = ft;
function ft(t2) {
  let e;
  if (t2 < 16 && (e = Gt(t2))) return e;
  if (t2 > 64 && it) return it.decode(p.subarray(f, f += t2));
  let r = f + t2, n = [];
  for (e = ""; f < r; ) {
    let s = p[f++];
    if (!(s & 128)) n.push(s);
    else if ((s & 224) === 192) {
      let o = p[f++] & 63;
      n.push((s & 31) << 6 | o);
    } else if ((s & 240) === 224) {
      let o = p[f++] & 63, l = p[f++] & 63;
      n.push((s & 31) << 12 | o << 6 | l);
    } else if ((s & 248) === 240) {
      let o = p[f++] & 63, l = p[f++] & 63, m = p[f++] & 63, g = (s & 7) << 18 | o << 12 | l << 6 | m;
      g > 65535 && (g -= 65536, n.push(g >>> 10 & 1023 | 55296), g = 56320 | g & 1023), n.push(g);
    } else n.push(s);
    n.length >= 4096 && (e += B.apply(String, n), n.length = 0);
  }
  return n.length > 0 && (e += B.apply(String, n)), e;
}
var B = String.fromCharCode;
function gr(t2) {
  let e = f, r = new Array(t2);
  for (let n = 0; n < t2; n++) {
    let s = p[f++];
    if ((s & 128) > 0) {
      f = e;
      return;
    }
    r[n] = s;
  }
  return B.apply(String, r);
}
function Gt(t2) {
  if (t2 < 4) if (t2 < 2) {
    if (t2 === 0) return "";
    {
      let e = p[f++];
      if ((e & 128) > 1) {
        f -= 1;
        return;
      }
      return B(e);
    }
  } else {
    let e = p[f++], r = p[f++];
    if ((e & 128) > 0 || (r & 128) > 0) {
      f -= 2;
      return;
    }
    if (t2 < 3) return B(e, r);
    let n = p[f++];
    if ((n & 128) > 0) {
      f -= 3;
      return;
    }
    return B(e, r, n);
  }
  else {
    let e = p[f++], r = p[f++], n = p[f++], s = p[f++];
    if ((e & 128) > 0 || (r & 128) > 0 || (n & 128) > 0 || (s & 128) > 0) {
      f -= 4;
      return;
    }
    if (t2 < 6) {
      if (t2 === 4) return B(e, r, n, s);
      {
        let o = p[f++];
        if ((o & 128) > 0) {
          f -= 5;
          return;
        }
        return B(e, r, n, s, o);
      }
    } else if (t2 < 8) {
      let o = p[f++], l = p[f++];
      if ((o & 128) > 0 || (l & 128) > 0) {
        f -= 6;
        return;
      }
      if (t2 < 7) return B(e, r, n, s, o, l);
      let m = p[f++];
      if ((m & 128) > 0) {
        f -= 7;
        return;
      }
      return B(e, r, n, s, o, l, m);
    } else {
      let o = p[f++], l = p[f++], m = p[f++], g = p[f++];
      if ((o & 128) > 0 || (l & 128) > 0 || (m & 128) > 0 || (g & 128) > 0) {
        f -= 8;
        return;
      }
      if (t2 < 10) {
        if (t2 === 8) return B(e, r, n, s, o, l, m, g);
        {
          let x = p[f++];
          if ((x & 128) > 0) {
            f -= 9;
            return;
          }
          return B(e, r, n, s, o, l, m, g, x);
        }
      } else if (t2 < 12) {
        let x = p[f++], k = p[f++];
        if ((x & 128) > 0 || (k & 128) > 0) {
          f -= 10;
          return;
        }
        if (t2 < 11) return B(e, r, n, s, o, l, m, g, x, k);
        let S = p[f++];
        if ((S & 128) > 0) {
          f -= 11;
          return;
        }
        return B(e, r, n, s, o, l, m, g, x, k, S);
      } else {
        let x = p[f++], k = p[f++], S = p[f++], F = p[f++];
        if ((x & 128) > 0 || (k & 128) > 0 || (S & 128) > 0 || (F & 128) > 0) {
          f -= 12;
          return;
        }
        if (t2 < 14) {
          if (t2 === 12) return B(e, r, n, s, o, l, m, g, x, k, S, F);
          {
            let W = p[f++];
            if ((W & 128) > 0) {
              f -= 13;
              return;
            }
            return B(e, r, n, s, o, l, m, g, x, k, S, F, W);
          }
        } else {
          let W = p[f++], z = p[f++];
          if ((W & 128) > 0 || (z & 128) > 0) {
            f -= 14;
            return;
          }
          if (t2 < 15) return B(e, r, n, s, o, l, m, g, x, k, S, F, W, z);
          let $ = p[f++];
          if (($ & 128) > 0) {
            f -= 15;
            return;
          }
          return B(e, r, n, s, o, l, m, g, x, k, S, F, W, z, $);
        }
      }
    }
  }
}
function br(t2) {
  return U.copyBuffers ? Uint8Array.prototype.slice.call(p, f, f += t2) : p.subarray(f, f += t2);
}
var Yt = new Float32Array(1);
var Ce = new Uint8Array(Yt.buffer, 0, 4);
function Ir() {
  let t2 = p[f++], e = p[f++], r = (t2 & 127) >> 2;
  if (r === 31) return e || t2 & 3 ? NaN : t2 & 128 ? -1 / 0 : 1 / 0;
  if (r === 0) {
    let n = ((t2 & 3) << 8 | e) / 16777216;
    return t2 & 128 ? -n : n;
  }
  return Ce[3] = t2 & 128 | (r >> 1) + 56, Ce[2] = (t2 & 7) << 5 | e >> 3, Ce[1] = e << 5, Ce[0] = 0, Yt[0];
}
var en = new Array(4096);
var j = class {
  constructor(e, r) {
    this.value = e, this.tag = r;
  }
};
M[0] = (t2) => new Date(t2);
M[1] = (t2) => new Date(Math.round(t2 * 1e3));
M[2] = (t2) => {
  let e = BigInt(0);
  for (let r = 0, n = t2.byteLength; r < n; r++) e = BigInt(t2[r]) + e << BigInt(8);
  return e;
};
M[3] = (t2) => BigInt(-1) - M[2](t2);
M[4] = (t2) => +(t2[1] + "e" + t2[0]);
M[5] = (t2) => t2[1] * Math.exp(t2[0] * Math.log(2));
var dt = (t2, e) => {
  t2 = t2 - 57344;
  let r = O[t2];
  r && r.isShared && ((O.restoreStructures || (O.restoreStructures = []))[t2] = r), O[t2] = e, e.read = lt(e);
};
M[pr] = (t2) => {
  let e = t2.length, r = t2[1];
  dt(t2[0], r);
  let n = {};
  for (let s = 2; s < e; s++) {
    let o = r[s - 2];
    n[v(o)] = t2[s];
  }
  return n;
};
M[14] = (t2) => R ? R[0].slice(R.position0, R.position0 += t2) : new j(t2, 14);
M[15] = (t2) => R ? R[1].slice(R.position1, R.position1 += t2) : new j(t2, 15);
var Ar = { Error, RegExp };
M[27] = (t2) => (Ar[t2[0]] || Error)(t2[1], t2[2]);
var Jt = (t2) => {
  if (p[f++] != 132) throw new Error("Packed values structure must be followed by a 4 element array");
  let e = t2();
  return T = T ? e.concat(T.slice(e.length)) : e, T.prefixes = t2(), T.suffixes = t2(), t2();
};
Jt.handlesRead = true;
M[51] = Jt;
M[Ht] = (t2) => {
  if (!T) if (U.getShared) ut();
  else return new j(t2, Ht);
  if (typeof t2 == "number") return T[16 + (t2 >= 0 ? 2 * t2 : -2 * t2 - 1)];
  throw new Error("No support for non-integer packed references yet");
};
M[28] = (t2) => {
  H || (H = /* @__PURE__ */ new Map(), H.id = 0);
  let e = H.id++, r = p[f], n;
  r >> 5 == 4 ? n = [] : n = {};
  let s = { target: n };
  H.set(e, s);
  let o = t2();
  return s.used ? Object.assign(n, o) : (s.target = o, o);
};
M[28].handlesRead = true;
M[29] = (t2) => {
  let e = H.get(t2);
  return e.used = true, e.target;
};
M[258] = (t2) => new Set(t2);
(M[259] = (t2) => (U.mapsAsObjects && (U.mapsAsObjects = false, we = true), t2())).handlesRead = true;
function ce(t2, e) {
  return typeof t2 == "string" ? t2 + e : t2 instanceof Array ? t2.concat(e) : Object.assign({}, t2, e);
}
function Q() {
  if (!T) if (U.getShared) ut();
  else throw new Error("No packed values available");
  return T;
}
var Dr = 1399353956;
ct.push((t2, e) => {
  if (t2 >= 225 && t2 <= 255) return ce(Q().prefixes[t2 - 224], e);
  if (t2 >= 28704 && t2 <= 32767) return ce(Q().prefixes[t2 - 28672], e);
  if (t2 >= 1879052288 && t2 <= 2147483647) return ce(Q().prefixes[t2 - 1879048192], e);
  if (t2 >= 216 && t2 <= 223) return ce(e, Q().suffixes[t2 - 216]);
  if (t2 >= 27647 && t2 <= 28671) return ce(e, Q().suffixes[t2 - 27639]);
  if (t2 >= 1811940352 && t2 <= 1879048191) return ce(e, Q().suffixes[t2 - 1811939328]);
  if (t2 == Dr) return { packedValues: T, structures: O.slice(0), version: e };
  if (t2 == 55799) return e;
});
var Ur = new Uint8Array(new Uint16Array([1]).buffer)[0] == 1;
var qt = [Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, typeof BigUint64Array > "u" ? { name: "BigUint64Array" } : BigUint64Array, Int8Array, Int16Array, Int32Array, typeof BigInt64Array > "u" ? { name: "BigInt64Array" } : BigInt64Array, Float32Array, Float64Array];
var Er = [64, 68, 69, 70, 71, 72, 77, 78, 79, 85, 86];
for (let t2 = 0; t2 < qt.length; t2++) Sr(qt[t2], Er[t2]);
function Sr(t2, e) {
  let r = "get" + t2.name.slice(0, -5);
  typeof t2 != "function" && (t2 = null);
  let n = t2.BYTES_PER_ELEMENT;
  for (let s = 0; s < 2; s++) {
    if (!s && n == 1) continue;
    let o = n == 2 ? 1 : n == 4 ? 2 : 3;
    M[s ? e : e - 4] = n == 1 || s == Ur ? (l) => {
      if (!t2) throw new Error("Could not find typed array for code " + e);
      return new t2(Uint8Array.prototype.slice.call(l, 0).buffer);
    } : (l) => {
      if (!t2) throw new Error("Could not find typed array for code " + e);
      let m = new DataView(l.buffer, l.byteOffset, l.byteLength), g = l.length >> o, x = new t2(g), k = m[r];
      for (let S = 0; S < g; S++) x[S] = k.call(m, S << o, s);
      return x;
    };
  }
}
function Cr() {
  let t2 = le(), e = f + D();
  for (let n = 2; n < t2; n++) {
    let s = le();
    f += s;
  }
  let r = f;
  return f = e, R = [ft(le()), ft(le())], R.position0 = 0, R.position1 = 0, R.postBundlePosition = f, f = r, D();
}
function le() {
  let t2 = p[f++] & 31;
  if (t2 > 23) switch (t2) {
    case 24:
      t2 = p[f++];
      break;
    case 25:
      t2 = V.getUint16(f), f += 2;
      break;
    case 26:
      t2 = V.getUint32(f), f += 4;
      break;
  }
  return t2;
}
function ut() {
  if (U.getShared) {
    let t2 = Xt(() => (p = null, U.getShared())) || {}, e = t2.structures || [];
    U.sharedVersion = t2.version, T = U.sharedValues = t2.packedValues, O === true ? U.structures = O = e : O.splice.apply(O, [0, e.length].concat(e));
  }
}
function Xt(t2) {
  let e = ee, r = f, n = at, s = ke, o = ge, l = Pe, m = ot, g = H, x = R, k = new Uint8Array(p.slice(0, ee)), S = O, F = U, W = be, z = t2();
  return ee = e, f = r, at = n, ke = s, ge = o, Pe = l, ot = m, H = g, R = x, p = k, be = W, O = S, U = F, V = new DataView(p.buffer, p.byteOffset, p.byteLength), z;
}
function Oe() {
  p = null, H = null, O = null;
}
function Zt(t2) {
  M[t2.tag] = t2.decode;
}
var Me = new Array(147);
for (let t2 = 0; t2 < 256; t2++) Me[t2] = +("1e" + Math.floor(45.15 - t2 * 0.30103));
var ht = new te({ useRecords: false });
var yt = ht.decode;
var Pr = ht.decodeMultiple;
var Re = { NEVER: 0, ALWAYS: 1, DECIMAL_ROUND: 3, DECIMAL_FIT: 4 };
var _e;
try {
  _e = new TextEncoder();
} catch {
}
var Fe;
var bt;
var Ve = globalThis.Buffer;
var Ae = typeof Ve < "u";
var pt = Ae ? Ve.allocUnsafeSlow : Uint8Array;
var Qt = Ae ? Ve : Uint8Array;
var er = 256;
var tr = Ae ? 4294967296 : 2144337920;
var mt;
var a;
var P;
var i = 0;
var Y;
var _ = null;
var kr = 61440;
var Or = /[\u0080-\uFFFF]/;
var L = Symbol("record-id");
var Ie = class extends te {
  constructor(e) {
    super(e), this.offset = 0;
    let r, n, s, o, l, m;
    e = e || {};
    let g = Qt.prototype.utf8Write ? function(c, y, d) {
      return a.utf8Write(c, y, d);
    } : _e && _e.encodeInto ? function(c, y) {
      return _e.encodeInto(c, a.subarray(y)).written;
    } : false, x = this, k = e.structures || e.saveStructures, S = e.maxSharedStructures;
    if (S == null && (S = k ? 128 : 0), S > 8190) throw new Error("Maximum maxSharedStructure is 8190");
    let F = e.sequential;
    F && (S = 0), this.structures || (this.structures = []), this.saveStructures && (this.saveShared = this.saveStructures);
    let W, z, $ = e.sharedValues, N;
    if ($) {
      N = /* @__PURE__ */ Object.create(null);
      for (let c = 0, y = $.length; c < y; c++) N[$[c]] = c;
    }
    let G = [], et = 0, Ee = 0;
    this.mapEncode = function(c, y) {
      if (this._keyMap && !this._mapped) switch (c.constructor.name) {
        case "Array":
          c = c.map((d) => this.encodeKeys(d));
          break;
      }
      return this.encode(c, y);
    }, this.encode = function(c, y) {
      if (a || (a = new pt(8192), P = new DataView(a.buffer, 0, 8192), i = 0), Y = a.length - 10, Y - i < 2048 ? (a = new pt(a.length), P = new DataView(a.buffer, 0, a.length), Y = a.length - 10, i = 0) : y === gt && (i = i + 7 & 2147483640), n = i, x.useSelfDescribedHeader && (P.setUint32(i, 3654940416), i += 3), m = x.structuredClone ? /* @__PURE__ */ new Map() : null, x.bundleStrings && typeof c != "string" ? (_ = [], _.size = 1 / 0) : _ = null, s = x.structures, s) {
        if (s.uninitialized) {
          let h = x.getShared() || {};
          x.structures = s = h.structures || [], x.sharedVersion = h.version;
          let u = x.sharedValues = h.packedValues;
          if (u) {
            N = {};
            for (let w = 0, b = u.length; w < b; w++) N[u[w]] = w;
          }
        }
        let d = s.length;
        if (d > S && !F && (d = S), !s.transitions) {
          s.transitions = /* @__PURE__ */ Object.create(null);
          for (let h = 0; h < d; h++) {
            let u = s[h];
            if (!u) continue;
            let w, b = s.transitions;
            for (let I = 0, A = u.length; I < A; I++) {
              b[L] === void 0 && (b[L] = h);
              let E = u[I];
              w = b[E], w || (w = b[E] = /* @__PURE__ */ Object.create(null)), b = w;
            }
            b[L] = h | 1048576;
          }
        }
        F || (s.nextId = d);
      }
      if (o && (o = false), l = s || [], z = N, e.pack) {
        let d = /* @__PURE__ */ new Map();
        if (d.values = [], d.encoder = x, d.maxValues = e.maxPrivatePackedValues || (N ? 16 : 1 / 0), d.objectMap = N || false, d.samplingPackedValues = W, Be(c, d), d.values.length > 0) {
          a[i++] = 216, a[i++] = 51, q(4);
          let h = d.values;
          C(h), q(0), q(0), z = Object.create(N || null);
          for (let u = 0, w = h.length; u < w; u++) z[h[u]] = u;
        }
      }
      mt = y & wt;
      try {
        if (mt) return;
        if (C(c), _ && sr(n, C), x.offset = i, m && m.idsToInsert) {
          i += m.idsToInsert.length * 2, i > Y && me(i), x.offset = i;
          let d = _r(a.subarray(n, i), m.idsToInsert);
          return m = null, d;
        }
        return y & gt ? (a.start = n, a.end = i, a) : a.subarray(n, i);
      } finally {
        if (s) {
          if (Ee < 10 && Ee++, s.length > S && (s.length = S), et > 1e4) s.transitions = null, Ee = 0, et = 0, G.length > 0 && (G = []);
          else if (G.length > 0 && !F) {
            for (let d = 0, h = G.length; d < h; d++) G[d][L] = void 0;
            G = [];
          }
        }
        if (o && x.saveShared) {
          x.structures.length > S && (x.structures = x.structures.slice(0, S));
          let d = a.subarray(n, i);
          return x.updateSharedData() === false ? x.encode(c) : d;
        }
        y & vr && (i = n);
      }
    }, this.findCommonStringsToPack = () => (W = /* @__PURE__ */ new Map(), N || (N = /* @__PURE__ */ Object.create(null)), (c) => {
      let y = c && c.threshold || 4, d = this.pack ? c.maxPrivatePackedValues || 16 : 0;
      $ || ($ = this.sharedValues = []);
      for (let [h, u] of W) u.count > y && (N[h] = d++, $.push(h), o = true);
      for (; this.saveShared && this.updateSharedData() === false; ) ;
      W = null;
    });
    let C = (c) => {
      i > Y && (a = me(i));
      var y = typeof c, d;
      if (y === "string") {
        if (z) {
          let b = z[c];
          if (b >= 0) {
            b < 16 ? a[i++] = b + 224 : (a[i++] = 198, b & 1 ? C(15 - b >> 1) : C(b - 16 >> 1));
            return;
          } else if (W && !e.pack) {
            let I = W.get(c);
            I ? I.count++ : W.set(c, { count: 1 });
          }
        }
        let h = c.length;
        if (_ && h >= 4 && h < 1024) {
          if ((_.size += h) > kr) {
            let I, A = (_[0] ? _[0].length * 3 + _[1].length : 0) + 10;
            i + A > Y && (a = me(i + A)), a[i++] = 217, a[i++] = 223, a[i++] = 249, a[i++] = _.position ? 132 : 130, a[i++] = 26, I = i - n, i += 4, _.position && sr(n, C), _ = ["", ""], _.size = 0, _.position = I;
          }
          let b = Or.test(c);
          _[b ? 0 : 1] += c, a[i++] = b ? 206 : 207, C(h);
          return;
        }
        let u;
        h < 32 ? u = 1 : h < 256 ? u = 2 : h < 65536 ? u = 3 : u = 5;
        let w = h * 3;
        if (i + w > Y && (a = me(i + w)), h < 64 || !g) {
          let b, I, A, E = i + u;
          for (b = 0; b < h; b++) I = c.charCodeAt(b), I < 128 ? a[E++] = I : I < 2048 ? (a[E++] = I >> 6 | 192, a[E++] = I & 63 | 128) : (I & 64512) === 55296 && ((A = c.charCodeAt(b + 1)) & 64512) === 56320 ? (I = 65536 + ((I & 1023) << 10) + (A & 1023), b++, a[E++] = I >> 18 | 240, a[E++] = I >> 12 & 63 | 128, a[E++] = I >> 6 & 63 | 128, a[E++] = I & 63 | 128) : (a[E++] = I >> 12 | 224, a[E++] = I >> 6 & 63 | 128, a[E++] = I & 63 | 128);
          d = E - i - u;
        } else d = g(c, i + u, w);
        d < 24 ? a[i++] = 96 | d : d < 256 ? (u < 2 && a.copyWithin(i + 2, i + 1, i + 1 + d), a[i++] = 120, a[i++] = d) : d < 65536 ? (u < 3 && a.copyWithin(i + 3, i + 2, i + 2 + d), a[i++] = 121, a[i++] = d >> 8, a[i++] = d & 255) : (u < 5 && a.copyWithin(i + 5, i + 3, i + 3 + d), a[i++] = 122, P.setUint32(i, d), i += 4), i += d;
      } else if (y === "number") if (!this.alwaysUseFloat && c >>> 0 === c) c < 24 ? a[i++] = c : c < 256 ? (a[i++] = 24, a[i++] = c) : c < 65536 ? (a[i++] = 25, a[i++] = c >> 8, a[i++] = c & 255) : (a[i++] = 26, P.setUint32(i, c), i += 4);
      else if (!this.alwaysUseFloat && c >> 0 === c) c >= -24 ? a[i++] = 31 - c : c >= -256 ? (a[i++] = 56, a[i++] = ~c) : c >= -65536 ? (a[i++] = 57, P.setUint16(i, ~c), i += 2) : (a[i++] = 58, P.setUint32(i, ~c), i += 4);
      else {
        let h;
        if ((h = this.useFloat32) > 0 && c < 4294967296 && c >= -2147483648) {
          a[i++] = 250, P.setFloat32(i, c);
          let u;
          if (h < 4 || (u = c * Me[(a[i] & 127) << 1 | a[i + 1] >> 7]) >> 0 === u) {
            i += 4;
            return;
          } else i--;
        }
        a[i++] = 251, P.setFloat64(i, c), i += 8;
      }
      else if (y === "object") if (!c) a[i++] = 246;
      else {
        if (m) {
          let u = m.get(c);
          if (u) {
            if (a[i++] = 216, a[i++] = 29, a[i++] = 25, !u.references) {
              let w = m.idsToInsert || (m.idsToInsert = []);
              u.references = [], w.push(u);
            }
            u.references.push(i - n), i += 2;
            return;
          } else m.set(c, { offset: i - n });
        }
        let h = c.constructor;
        if (h === Object) tt(c, true);
        else if (h === Array) {
          d = c.length, d < 24 ? a[i++] = 128 | d : q(d);
          for (let u = 0; u < d; u++) C(c[u]);
        } else if (h === Map) if ((this.mapsAsObjects ? this.useTag259ForMaps !== false : this.useTag259ForMaps) && (a[i++] = 217, a[i++] = 1, a[i++] = 3), d = c.size, d < 24 ? a[i++] = 160 | d : d < 256 ? (a[i++] = 184, a[i++] = d) : d < 65536 ? (a[i++] = 185, a[i++] = d >> 8, a[i++] = d & 255) : (a[i++] = 186, P.setUint32(i, d), i += 4), x.keyMap) for (let [u, w] of c) C(x.encodeKey(u)), C(w);
        else for (let [u, w] of c) C(u), C(w);
        else {
          for (let u = 0, w = Fe.length; u < w; u++) {
            let b = bt[u];
            if (c instanceof b) {
              let I = Fe[u], A = I.tag;
              A == null && (A = I.getTag && I.getTag.call(this, c)), A < 24 ? a[i++] = 192 | A : A < 256 ? (a[i++] = 216, a[i++] = A) : A < 65536 ? (a[i++] = 217, a[i++] = A >> 8, a[i++] = A & 255) : A > -1 && (a[i++] = 218, P.setUint32(i, A), i += 4), I.encode.call(this, c, C, me);
              return;
            }
          }
          if (c[Symbol.iterator]) {
            if (mt) {
              let u = new Error("Iterable should be serialized as iterator");
              throw u.iteratorNotHandled = true, u;
            }
            a[i++] = 159;
            for (let u of c) C(u);
            a[i++] = 255;
            return;
          }
          if (c[Symbol.asyncIterator] || xt(c)) {
            let u = new Error("Iterable/blob should be serialized as iterator");
            throw u.iteratorNotHandled = true, u;
          }
          tt(c, !c.hasOwnProperty);
        }
      }
      else if (y === "boolean") a[i++] = c ? 245 : 244;
      else if (y === "bigint") {
        if (c < BigInt(1) << BigInt(64) && c >= 0) a[i++] = 27, P.setBigUint64(i, c);
        else if (c > -(BigInt(1) << BigInt(64)) && c < 0) a[i++] = 59, P.setBigUint64(i, -c - BigInt(1));
        else if (this.largeBigIntToFloat) a[i++] = 251, P.setFloat64(i, Number(c));
        else throw new RangeError(c + " was too large to fit in CBOR 64-bit integer format, set largeBigIntToFloat to convert to float-64");
        i += 8;
      } else if (y === "undefined") a[i++] = 247;
      else throw new Error("Unknown type: " + y);
    }, tt = this.useRecords === false ? this.variableMapSize ? (c) => {
      let y = Object.keys(c), d = Object.values(c), h = y.length;
      h < 24 ? a[i++] = 160 | h : h < 256 ? (a[i++] = 184, a[i++] = h) : h < 65536 ? (a[i++] = 185, a[i++] = h >> 8, a[i++] = h & 255) : (a[i++] = 186, P.setUint32(i, h), i += 4);
      let u;
      if (x.keyMap) for (let w = 0; w < h; w++) C(encodeKey(y[w])), C(d[w]);
      else for (let w = 0; w < h; w++) C(y[w]), C(d[w]);
    } : (c, y) => {
      a[i++] = 185;
      let d = i - n;
      i += 2;
      let h = 0;
      if (x.keyMap) for (let u in c) (y || c.hasOwnProperty(u)) && (C(x.encodeKey(u)), C(c[u]), h++);
      else for (let u in c) (y || c.hasOwnProperty(u)) && (C(u), C(c[u]), h++);
      a[d++ + n] = h >> 8, a[d + n] = h & 255;
    } : (c, y) => {
      let d, h = l.transitions || (l.transitions = /* @__PURE__ */ Object.create(null)), u = 0, w = 0, b, I;
      if (this.keyMap) {
        I = Object.keys(c).map((E) => this.encodeKey(E)), w = I.length;
        for (let E = 0; E < w; E++) {
          let vt = I[E];
          d = h[vt], d || (d = h[vt] = /* @__PURE__ */ Object.create(null), u++), h = d;
        }
      } else for (let E in c) (y || c.hasOwnProperty(E)) && (d = h[E], d || (h[L] & 1048576 && (b = h[L] & 65535), d = h[E] = /* @__PURE__ */ Object.create(null), u++), h = d, w++);
      let A = h[L];
      if (A !== void 0) A &= 65535, a[i++] = 217, a[i++] = A >> 8 | 224, a[i++] = A & 255;
      else if (I || (I = h.__keys__ || (h.__keys__ = Object.keys(c))), b === void 0 ? (A = l.nextId++, A || (A = 0, l.nextId = 1), A >= er && (l.nextId = (A = S) + 1)) : A = b, l[A] = I, A < S) {
        a[i++] = 217, a[i++] = A >> 8 | 224, a[i++] = A & 255, h = l.transitions;
        for (let E = 0; E < w; E++) (h[L] === void 0 || h[L] & 1048576) && (h[L] = A), h = h[I[E]];
        h[L] = A | 1048576, o = true;
      } else {
        if (h[L] = A, P.setUint32(i, 3655335680), i += 3, u && (et += Ee * u), G.length >= er - S && (G.shift()[L] = void 0), G.push(h), q(w + 2), C(57344 + A), C(I), y === null) return;
        for (let E in c) (y || c.hasOwnProperty(E)) && C(c[E]);
        return;
      }
      if (w < 24 ? a[i++] = 128 | w : q(w), y !== null) for (let E in c) (y || c.hasOwnProperty(E)) && C(c[E]);
    }, me = (c) => {
      let y;
      if (c > 16777216) {
        if (c - n > tr) throw new Error("Encoded buffer would be larger than maximum buffer size");
        y = Math.min(tr, Math.round(Math.max((c - n) * (c > 67108864 ? 1.25 : 2), 4194304) / 4096) * 4096);
      } else y = (Math.max(c - n << 2, a.length - 1) >> 12) + 1 << 12;
      let d = new pt(y);
      return P = new DataView(d.buffer, 0, y), a.copy ? a.copy(d, 0, n, c) : d.set(a.slice(n, c)), i -= n, n = 0, Y = d.length - 10, a = d;
    }, Z = 100, Vt = 1e3;
    this.encodeAsIterable = function(c, y) {
      return Tt(c, y, oe);
    }, this.encodeAsAsyncIterable = function(c, y) {
      return Tt(c, y, Lt);
    };
    function* oe(c, y, d) {
      let h = c.constructor;
      if (h === Object) {
        let u = x.useRecords !== false;
        u ? tt(c, null) : rr(Object.keys(c).length, 160);
        for (let w in c) {
          let b = c[w];
          u || C(w), b && typeof b == "object" ? y[w] ? yield* oe(b, y[w]) : yield* rt(b, y, w) : C(b);
        }
      } else if (h === Array) {
        let u = c.length;
        q(u);
        for (let w = 0; w < u; w++) {
          let b = c[w];
          b && (typeof b == "object" || i - n > Z) ? y.element ? yield* oe(b, y.element) : yield* rt(b, y, "element") : C(b);
        }
      } else if (c[Symbol.iterator]) {
        a[i++] = 159;
        for (let u of c) u && (typeof u == "object" || i - n > Z) ? y.element ? yield* oe(u, y.element) : yield* rt(u, y, "element") : C(u);
        a[i++] = 255;
      } else xt(c) ? (rr(c.size, 64), yield a.subarray(n, i), yield c, xe()) : c[Symbol.asyncIterator] ? (a[i++] = 159, yield a.subarray(n, i), yield c, xe(), a[i++] = 255) : C(c);
      d && i > n ? yield a.subarray(n, i) : i - n > Z && (yield a.subarray(n, i), xe());
    }
    function* rt(c, y, d) {
      let h = i - n;
      try {
        C(c), i - n > Z && (yield a.subarray(n, i), xe());
      } catch (u) {
        if (u.iteratorNotHandled) y[d] = {}, i = n + h, yield* oe.call(this, c, y[d]);
        else throw u;
      }
    }
    function xe() {
      Z = Vt, x.encode(null, wt);
    }
    function Tt(c, y, d) {
      return y && y.chunkThreshold ? Z = Vt = y.chunkThreshold : Z = 100, c && typeof c == "object" ? (x.encode(null, wt), d(c, x.iterateProperties || (x.iterateProperties = {}), true)) : [x.encode(c)];
    }
    async function* Lt(c, y) {
      for (let d of oe(c, y, true)) {
        let h = d.constructor;
        if (h === Qt || h === Uint8Array) yield d;
        else if (xt(d)) {
          let u = d.stream().getReader(), w;
          for (; !(w = await u.read()).done; ) yield w.value;
        } else if (d[Symbol.asyncIterator]) for await (let u of d) xe(), u ? yield* Lt(u, y.async || (y.async = {})) : yield x.encode(u);
        else yield d;
      }
    }
  }
  useBuffer(e) {
    a = e, P = new DataView(a.buffer, a.byteOffset, a.byteLength), i = 0;
  }
  clearSharedData() {
    this.structures && (this.structures = []), this.sharedValues && (this.sharedValues = void 0);
  }
  updateSharedData() {
    let e = this.sharedVersion || 0;
    this.sharedVersion = e + 1;
    let r = this.structures.slice(0), n = new We(r, this.sharedValues, this.sharedVersion), s = this.saveShared(n, (o) => (o && o.version || 0) == e);
    return s === false ? (n = this.getShared() || {}, this.structures = n.structures || [], this.sharedValues = n.packedValues, this.sharedVersion = n.version, this.structures.nextId = this.structures.length) : r.forEach((o, l) => this.structures[l] = o), s;
  }
};
function rr(t2, e) {
  t2 < 24 ? a[i++] = e | t2 : t2 < 256 ? (a[i++] = e | 24, a[i++] = t2) : t2 < 65536 ? (a[i++] = e | 25, a[i++] = t2 >> 8, a[i++] = t2 & 255) : (a[i++] = e | 26, P.setUint32(i, t2), i += 4);
}
var We = class {
  constructor(e, r, n) {
    this.structures = e, this.packedValues = r, this.version = n;
  }
};
function q(t2) {
  t2 < 24 ? a[i++] = 128 | t2 : t2 < 256 ? (a[i++] = 152, a[i++] = t2) : t2 < 65536 ? (a[i++] = 153, a[i++] = t2 >> 8, a[i++] = t2 & 255) : (a[i++] = 154, P.setUint32(i, t2), i += 4);
}
var Mr = typeof Blob > "u" ? function() {
} : Blob;
function xt(t2) {
  if (t2 instanceof Mr) return true;
  let e = t2[Symbol.toStringTag];
  return e === "Blob" || e === "File";
}
function Be(t2, e) {
  switch (typeof t2) {
    case "string":
      if (t2.length > 3) {
        if (e.objectMap[t2] > -1 || e.values.length >= e.maxValues) return;
        let n = e.get(t2);
        if (n) ++n.count == 2 && e.values.push(t2);
        else if (e.set(t2, { count: 1 }), e.samplingPackedValues) {
          let s = e.samplingPackedValues.get(t2);
          s ? s.count++ : e.samplingPackedValues.set(t2, { count: 1 });
        }
      }
      break;
    case "object":
      if (t2) if (t2 instanceof Array) for (let n = 0, s = t2.length; n < s; n++) Be(t2[n], e);
      else {
        let n = !e.encoder.useRecords;
        for (var r in t2) t2.hasOwnProperty(r) && (n && Be(r, e), Be(t2[r], e));
      }
      break;
    case "function":
      console.log(t2);
  }
}
var Rr = new Uint8Array(new Uint16Array([1]).buffer)[0] == 1;
bt = [Date, Set, Error, RegExp, j, ArrayBuffer, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, typeof BigUint64Array > "u" ? function() {
} : BigUint64Array, Int8Array, Int16Array, Int32Array, typeof BigInt64Array > "u" ? function() {
} : BigInt64Array, Float32Array, Float64Array, We];
Fe = [{ tag: 1, encode(t2, e) {
  let r = t2.getTime() / 1e3;
  (this.useTimestamp32 || t2.getMilliseconds() === 0) && r >= 0 && r < 4294967296 ? (a[i++] = 26, P.setUint32(i, r), i += 4) : (a[i++] = 251, P.setFloat64(i, r), i += 8);
} }, { tag: 258, encode(t2, e) {
  let r = Array.from(t2);
  e(r);
} }, { tag: 27, encode(t2, e) {
  e([t2.name, t2.message]);
} }, { tag: 27, encode(t2, e) {
  e(["RegExp", t2.source, t2.flags]);
} }, { getTag(t2) {
  return t2.tag;
}, encode(t2, e) {
  e(t2.value);
} }, { encode(t2, e, r) {
  nr(t2, r);
} }, { getTag(t2) {
  if (t2.constructor === Uint8Array && (this.tagUint8Array || Ae && this.tagUint8Array !== false)) return 64;
}, encode(t2, e, r) {
  nr(t2, r);
} }, K(68, 1), K(69, 2), K(70, 4), K(71, 8), K(72, 1), K(77, 2), K(78, 4), K(79, 8), K(85, 4), K(86, 8), { encode(t2, e) {
  let r = t2.packedValues || [], n = t2.structures || [];
  if (r.values.length > 0) {
    a[i++] = 216, a[i++] = 51, q(4);
    let s = r.values;
    e(s), q(0), q(0), packedObjectMap = Object.create(sharedPackedObjectMap || null);
    for (let o = 0, l = s.length; o < l; o++) packedObjectMap[s[o]] = o;
  }
  if (n) {
    P.setUint32(i, 3655335424), i += 3;
    let s = n.slice(0);
    s.unshift(57344), s.push(new j(t2.version, 1399353956)), e(s);
  } else e(new j(t2.version, 1399353956));
} }];
function K(t2, e) {
  return !Rr && e > 1 && (t2 -= 4), { tag: t2, encode: function(n, s) {
    let o = n.byteLength, l = n.byteOffset || 0, m = n.buffer || n;
    s(Ae ? Ve.from(m, l, o) : new Uint8Array(m, l, o));
  } };
}
function nr(t2, e) {
  let r = t2.byteLength;
  r < 24 ? a[i++] = 64 + r : r < 256 ? (a[i++] = 88, a[i++] = r) : r < 65536 ? (a[i++] = 89, a[i++] = r >> 8, a[i++] = r & 255) : (a[i++] = 90, P.setUint32(i, r), i += 4), i + r >= a.length && e(i + r), a.set(t2.buffer ? t2 : new Uint8Array(t2), i), i += r;
}
function _r(t2, e) {
  let r, n = e.length * 2, s = t2.length - n;
  e.sort((o, l) => o.offset > l.offset ? 1 : -1);
  for (let o = 0; o < e.length; o++) {
    let l = e[o];
    l.id = o;
    for (let m of l.references) t2[m++] = o >> 8, t2[m] = o & 255;
  }
  for (; r = e.pop(); ) {
    let o = r.offset;
    t2.copyWithin(o + n, o, s), n -= 2;
    let l = o + n;
    t2[l++] = 216, t2[l++] = 28, s = o;
  }
  return t2;
}
function sr(t2, e) {
  P.setUint32(_.position + t2, i - _.position - t2 + 1);
  let r = _;
  _ = null, e(r[0]), e(r[1]);
}
function It(t2) {
  if (t2.Class) {
    if (!t2.encode) throw new Error("Extension has no encode function");
    bt.unshift(t2.Class), Fe.unshift(t2);
  }
  Zt(t2);
}
var At = new Ie({ useRecords: false });
var Dt = At.encode;
var Br = At.encodeAsIterable;
var Fr = At.encodeAsAsyncIterable;
var { NEVER: Wr, ALWAYS: Vr, DECIMAL_ROUND: Tr, DECIMAL_FIT: Lr } = Re;
var gt = 512;
var vr = 1024;
var wt = 2048;
var ir = class {
  debug;
  constructor(e = false, r) {
    this.debug = e, r && r.forEach(It);
  }
  encoder(e) {
    return new Ut(e, this.debug);
  }
  decoder(e) {
    return new Et(e, this.debug);
  }
};
var Ut = class {
  w;
  debug;
  constructor(e, r = false) {
    this.w = e, this.debug = r;
  }
  async encode(e) {
    this.debug && console.log("<<", e);
    let r = Dt(e), n = 0;
    for (; n < r.length; ) n += await this.w.write(r.subarray(n));
  }
};
var Et = class {
  r;
  debug;
  constructor(e, r = false) {
    this.r = e, this.debug = r;
  }
  async decode(e) {
    let r = new Uint8Array(e), n = 0;
    for (; n < e; ) {
      let o = await this.r.read(r.subarray(n));
      if (o === null) return Promise.resolve(null);
      n += o;
    }
    let s = yt(r);
    return this.debug && console.log(">>", s), Promise.resolve(s);
  }
};
function Te(t2, e, r = 0) {
  r = Math.max(0, Math.min(r, e.byteLength));
  let n = e.byteLength - r;
  return t2.byteLength > n && (t2 = t2.subarray(0, n)), e.set(t2, r), t2.byteLength;
}
var Le = 32 * 1024;
var St = 2 ** 32 - 2;
var ve = class {
  _buf;
  _off;
  constructor(e) {
    this._buf = e === void 0 ? new Uint8Array(0) : new Uint8Array(e), this._off = 0;
  }
  bytes(e = { copy: true }) {
    return e.copy === false ? this._buf.subarray(this._off) : this._buf.slice(this._off);
  }
  empty() {
    return this._buf.byteLength <= this._off;
  }
  get length() {
    return this._buf.byteLength - this._off;
  }
  get capacity() {
    return this._buf.buffer.byteLength;
  }
  truncate(e) {
    if (e === 0) {
      this.reset();
      return;
    }
    if (e < 0 || e > this.length) throw Error("bytes.Buffer: truncation out of range");
    this._reslice(this._off + e);
  }
  reset() {
    this._reslice(0), this._off = 0;
  }
  _tryGrowByReslice(e) {
    let r = this._buf.byteLength;
    return e <= this.capacity - r ? (this._reslice(r + e), r) : -1;
  }
  _reslice(e) {
    this._buf = new Uint8Array(this._buf.buffer, 0, e);
  }
  readSync(e) {
    if (this.empty()) return this.reset(), e.byteLength === 0 ? 0 : null;
    let r = Te(this._buf.subarray(this._off), e);
    return this._off += r, r;
  }
  read(e) {
    let r = this.readSync(e);
    return Promise.resolve(r);
  }
  writeSync(e) {
    let r = this._grow(e.byteLength);
    return Te(e, this._buf, r);
  }
  write(e) {
    let r = this.writeSync(e);
    return Promise.resolve(r);
  }
  _grow(e) {
    let r = this.length;
    r === 0 && this._off !== 0 && this.reset();
    let n = this._tryGrowByReslice(e);
    if (n >= 0) return n;
    let s = this.capacity;
    if (e <= Math.floor(s / 2) - r) Te(this._buf.subarray(this._off), this._buf);
    else {
      if (s + e > St) throw new Error("The buffer cannot be grown beyond the maximum size.");
      {
        let o = new Uint8Array(Math.min(2 * s + e, St));
        Te(this._buf.subarray(this._off), o), this._buf = o;
      }
    }
    return this._off = 0, this._reslice(Math.min(r + e, St)), r;
  }
  grow(e) {
    if (e < 0) throw Error("Buffer.grow: negative count");
    let r = this._grow(e);
    this._reslice(r);
  }
  async readFrom(e) {
    let r = 0, n = new Uint8Array(Le);
    for (; ; ) {
      let s = this.capacity - this.length < Le, o = s ? n : new Uint8Array(this._buf.buffer, this.length), l = await e.read(o);
      if (l === null) return r;
      s ? this.writeSync(o.subarray(0, l)) : this._reslice(this.length + l), r += l;
    }
  }
  readFromSync(e) {
    let r = 0, n = new Uint8Array(Le);
    for (; ; ) {
      let s = this.capacity - this.length < Le, o = s ? n : new Uint8Array(this._buf.buffer, this.length), l = e.readSync(o);
      if (l === null) return r;
      s ? this.writeSync(o.subarray(0, l)) : this._reslice(this.length + l), r += l;
    }
  }
};
var fe = class {
  codec;
  constructor(e) {
    this.codec = e;
  }
  encoder(e) {
    return new Ct(e, this.codec);
  }
  decoder(e) {
    return new Pt(e, this.codec.decoder(e));
  }
};
var Ct = class {
  w;
  codec;
  constructor(e, r) {
    this.w = e, this.codec = r;
  }
  async encode(e) {
    let r = new ve();
    await this.codec.encoder(r).encode(e);
    let s = new DataView(new ArrayBuffer(4));
    s.setUint32(0, r.length);
    let o = new Uint8Array(r.length + 4);
    o.set(new Uint8Array(s.buffer), 0), o.set(r.bytes(), 4);
    let l = 0;
    for (; l < o.length; ) l += await this.w.write(o.subarray(l));
  }
};
var Pt = class {
  r;
  dec;
  constructor(e, r) {
    this.r = e, this.dec = r;
  }
  async decode(e) {
    let r = new Uint8Array(4);
    if (await this.r.read(r) === null) return null;
    let o = new DataView(r.buffer).getUint32(0);
    return await this.dec.decode(o);
  }
};
var de = class {
  session;
  codec;
  constructor(e, r) {
    this.session = e, this.codec = r;
  }
  async call(e, r) {
    let n = await this.session.open();
    try {
      let s = new fe(this.codec), o = s.encoder(n), l = s.decoder(n);
      await o.encode({ S: e }), await o.encode(r);
      let m = await l.decode(), g = new ze(n, s);
      if (g.error = m.E, g.error !== void 0 && g.error !== null) throw g.error;
      return g.value = await l.decode(), g.continue = m.C, g.continue || await n.close(), g;
    } catch (s) {
      return await n.close(), Promise.reject(s);
    }
  }
};
function ar(t2) {
  function e(r, n) {
    return new Proxy(Object.assign(() => {
    }, { path: r, callable: n }), { get(s, o, l) {
      return o.startsWith("__") ? Reflect.get(s, o, l) : e(s.path ? `${s.path}.${o}` : o, s.callable);
    }, apply(s, o, l = []) {
      return s.callable(s.path, l);
    } });
  }
  return e("", t2.call.bind(t2));
}
function Ue(t2) {
  return { respondRPC: t2 };
}
function zr() {
  return Ue((t2, e) => {
    t2.return(new Error(`not found: ${e.selector}`));
  });
}
function kt(t2) {
  return t2 === "" ? "/" : (t2[0] != "/" && (t2 = "/" + t2), t2 = t2.replace(".", "/"), t2.toLowerCase());
}
var J = class {
  handlers;
  constructor() {
    this.handlers = {};
  }
  async respondRPC(e, r) {
    await this.handler(r).respondRPC(e, r);
  }
  handler(e) {
    let r = this.match(e.selector);
    return r || zr();
  }
  remove(e) {
    e = kt(e);
    let r = this.match(e);
    return delete this.handlers[e], r || null;
  }
  match(e) {
    if (e = kt(e), this.handlers.hasOwnProperty(e)) return this.handlers[e];
    let r = Object.keys(this.handlers).filter((n) => n.endsWith("/"));
    r.sort((n, s) => s.length - n.length);
    for (let n of r) if (e.startsWith(n)) {
      let s = this.handlers[n], o = s;
      return o.match && o.match instanceof Function ? o.match(e.slice(n.length)) : s;
    }
    return null;
  }
  handle(e, r) {
    if (e === "") throw "handle: invalid selector";
    let n = kt(e), s = r;
    if (s.match && s.match instanceof Function && !n.endsWith("/") && (n = n + "/"), !r) throw "handle: invalid handler";
    if (this.match(n)) throw "handle: selector already registered";
    this.handlers[n] = r;
  }
};
async function cr(t2, e, r) {
  let n = new fe(e), s = n.decoder(t2), o = await s.decode(), l = new Ne(o.S, t2, s);
  l.caller = new de(t2.session, e);
  let m = new He(), g = new Ot(t2, n, m);
  return r || (r = new J()), await r.respondRPC(g, l), g.responded || await g.return(null), Promise.resolve();
}
var Ot = class {
  header;
  ch;
  codec;
  responded;
  constructor(e, r, n) {
    this.ch = e, this.codec = r, this.header = n, this.responded = false;
  }
  send(e) {
    return this.codec.encoder(this.ch).encode(e);
  }
  return(e) {
    return this.respond(e, false);
  }
  async continue(e) {
    return await this.respond(e, true), this.ch;
  }
  async respond(e, r) {
    return this.responded = true, this.header.C = r, e instanceof Error && (this.header.E = e.message, e = null), await this.send(this.header), await this.send(e), r || await this.ch.close(), Promise.resolve();
  }
};
var Ne = class {
  selector;
  channel;
  caller;
  decoder;
  constructor(e, r, n) {
    this.selector = e, this.channel = r, this.decoder = n;
  }
  receive() {
    return this.decoder.decode();
  }
};
var He = class {
  E;
  C;
  constructor() {
    this.E = void 0, this.C = false;
  }
};
var ze = class {
  error;
  continue;
  value;
  channel;
  codec;
  constructor(e, r) {
    this.channel = e, this.codec = r, this.error = void 0, this.continue = false;
  }
  send(e) {
    return this.codec.encoder(this.channel).encode(e);
  }
  receive() {
    return this.codec.decoder(this.channel).decode();
  }
};
var je = class {
  session;
  caller;
  codec;
  responder;
  constructor(e, r) {
    this.session = e, this.codec = r, this.caller = new de(e, r), this.responder = new J();
  }
  close() {
    return this.session.close();
  }
  async respond() {
    for (; ; ) {
      let e = await this.session.accept();
      if (e === null) break;
      cr(e, this.codec, this.responder);
    }
  }
  async call(e, r) {
    return this.caller.call(e, r);
  }
  handle(e, r) {
    this.responder.handle(e, r);
  }
  respondRPC(e, r) {
    this.responder.respondRPC(e, r);
  }
  virtualize() {
    return ar(this.caller);
  }
};
var lr = /* @__PURE__ */ new Map([[100, 12], [101, 16], [102, 4], [103, 8], [104, 8], [105, 4], [106, 4]]);
var Ke = class {
  w;
  constructor(e) {
    this.w = e;
  }
  async encode(e) {
    ue.messages && console.log("<<ENC", e);
    let r = Hr(e);
    ue.bytes && console.log("<<ENC", r);
    let n = 0;
    for (; n < r.length; ) n += await this.w.write(r.subarray(n));
    return n;
  }
};
function Hr(t2) {
  if (t2.ID === 106) {
    let e = t2, r = new DataView(new ArrayBuffer(5));
    return r.setUint8(0, e.ID), r.setUint32(1, e.channelID), new Uint8Array(r.buffer);
  }
  if (t2.ID === 104) {
    let e = t2, r = new DataView(new ArrayBuffer(9));
    r.setUint8(0, e.ID), r.setUint32(1, e.channelID), r.setUint32(5, e.length);
    let n = new Uint8Array(9 + e.length);
    return n.set(new Uint8Array(r.buffer), 0), n.set(e.data, 9), n;
  }
  if (t2.ID === 105) {
    let e = t2, r = new DataView(new ArrayBuffer(5));
    return r.setUint8(0, e.ID), r.setUint32(1, e.channelID), new Uint8Array(r.buffer);
  }
  if (t2.ID === 100) {
    let e = t2, r = new DataView(new ArrayBuffer(13));
    return r.setUint8(0, e.ID), r.setUint32(1, e.senderID), r.setUint32(5, e.windowSize), r.setUint32(9, e.maxPacketSize), new Uint8Array(r.buffer);
  }
  if (t2.ID === 101) {
    let e = t2, r = new DataView(new ArrayBuffer(17));
    return r.setUint8(0, e.ID), r.setUint32(1, e.channelID), r.setUint32(5, e.senderID), r.setUint32(9, e.windowSize), r.setUint32(13, e.maxPacketSize), new Uint8Array(r.buffer);
  }
  if (t2.ID === 102) {
    let e = t2, r = new DataView(new ArrayBuffer(5));
    return r.setUint8(0, e.ID), r.setUint32(1, e.channelID), new Uint8Array(r.buffer);
  }
  if (t2.ID === 103) {
    let e = t2, r = new DataView(new ArrayBuffer(9));
    return r.setUint8(0, e.ID), r.setUint32(1, e.channelID), r.setUint32(5, e.additionalBytes), new Uint8Array(r.buffer);
  }
  throw `marshal of unknown type: ${t2}`;
}
function Ge(t2, e) {
  let r = new Uint8Array(e), n = 0;
  return t2.forEach((s) => {
    r.set(s, n), n += s.length;
  }), r;
}
var pe = class {
  q;
  waiters;
  closed;
  constructor() {
    this.q = [], this.waiters = [], this.closed = false;
  }
  push(e) {
    if (this.closed) throw "closed queue";
    if (this.waiters.length > 0) {
      let r = this.waiters.shift();
      r && r(e);
      return;
    }
    this.q.push(e);
  }
  shift() {
    return this.closed ? Promise.resolve(null) : new Promise((e) => {
      if (this.q.length > 0) {
        e(this.q.shift() || null);
        return;
      }
      this.waiters.push(e);
    });
  }
  close() {
    this.closed || (this.closed = true, this.waiters.forEach((e) => {
      e(null);
    }));
  }
};
var $e = class {
  gotEOF;
  readBuf;
  readers;
  constructor() {
    this.readBuf = new Uint8Array(0), this.gotEOF = false, this.readers = [];
  }
  read(e) {
    return new Promise((r) => {
      let n = () => {
        if (this.readBuf === void 0) {
          r(null);
          return;
        }
        if (this.readBuf.length == 0) {
          if (this.gotEOF) {
            this.readBuf = void 0, r(null);
            return;
          }
          this.readers.push(n);
          return;
        }
        let s = this.readBuf.slice(0, e.length);
        this.readBuf = this.readBuf.slice(s.length), this.readBuf.length == 0 && this.gotEOF && (this.readBuf = void 0), e.set(s), r(s.length);
      };
      n();
    });
  }
  write(e) {
    for (this.readBuf && (this.readBuf = Ge([this.readBuf, e], this.readBuf.length + e.length)); !this.readBuf || this.readBuf.length > 0; ) {
      let r = this.readers.shift();
      if (!r) break;
      r();
    }
    return Promise.resolve(e.length);
  }
  eof() {
    this.gotEOF = true, this.flushReaders();
  }
  close() {
    this.readBuf = void 0, this.flushReaders();
  }
  flushReaders() {
    for (; ; ) {
      let e = this.readers.shift();
      if (!e) return;
      e();
    }
  }
};
var Ye = class {
  r;
  constructor(e) {
    this.r = e;
  }
  async decode() {
    let e = await jr(this.r);
    if (e === null) return Promise.resolve(null);
    ue.bytes && console.log(">>DEC", e);
    let r = Kr(e);
    return ue.messages && console.log(">>DEC", r), r;
  }
};
async function jr(t2) {
  let e = new Uint8Array(1);
  if (await t2.read(e) === null) return Promise.resolve(null);
  let n = e[0], s = lr.get(n);
  if (s === void 0 || n < 100 || n > 106) return Promise.reject(`bad packet: ${n}`);
  let o = new Uint8Array(s);
  if (await t2.read(o) === null) return Promise.reject("unexpected EOF reading packet");
  if (n === 104) {
    let g = new DataView(o.buffer).getUint32(4), x = 0, k = [];
    for (; x < g; ) {
      let S = new Uint8Array(g - x), F = await t2.read(S);
      if (F === null) return Promise.reject("unexpected EOF reading data chunk");
      x += F, k.push(S.slice(0, F));
    }
    return Ge([e, o, ...k], 1 + o.length + g);
  }
  return Ge([e, o], o.length + 1);
}
function Kr(t2) {
  let e = new DataView(t2.buffer);
  switch (t2[0]) {
    case 106:
      return { ID: t2[0], channelID: e.getUint32(1) };
    case 104:
      let r = e.getUint32(5), n = new Uint8Array(t2.buffer.slice(9));
      return { ID: t2[0], channelID: e.getUint32(1), length: r, data: n };
    case 105:
      return { ID: t2[0], channelID: e.getUint32(1) };
    case 100:
      return { ID: t2[0], senderID: e.getUint32(1), windowSize: e.getUint32(5), maxPacketSize: e.getUint32(9) };
    case 101:
      return { ID: t2[0], channelID: e.getUint32(1), senderID: e.getUint32(5), windowSize: e.getUint32(9), maxPacketSize: e.getUint32(13) };
    case 102:
      return { ID: t2[0], channelID: e.getUint32(1) };
    case 103:
      return { ID: t2[0], channelID: e.getUint32(1), additionalBytes: e.getUint32(5) };
    default:
      throw `unmarshal of unknown type: ${t2[0]}`;
  }
}
var ue = { messages: false, bytes: false };
var Rt = 9;
var _t = Number.MAX_VALUE;
var Je = class {
  conn;
  channels;
  incoming;
  enc;
  dec;
  done;
  closed;
  constructor(e) {
    this.conn = e, this.enc = new Ke(e), this.dec = new Ye(e), this.channels = [], this.incoming = new pe(), this.done = this.loop(), this.closed = false;
  }
  async open() {
    let e = this.newChannel();
    if (e.maxIncomingPayload = Xe, await this.enc.encode({ ID: 100, windowSize: e.myWindow, maxPacketSize: e.maxIncomingPayload, senderID: e.localId }), await e.ready.shift()) return e;
    throw "failed to open";
  }
  accept() {
    return this.incoming.shift();
  }
  async close() {
    for (let e of Object.keys(this.channels)) {
      let r = parseInt(e);
      this.channels[r] !== void 0 && this.channels[r].shutdown();
    }
    this.conn.close(), this.closed = true, await this.done;
  }
  async loop() {
    try {
      for (; ; ) {
        let e = await this.dec.decode();
        if (e === null) {
          this.close();
          return;
        }
        if (e.ID === 100) {
          await this.handleOpen(e);
          continue;
        }
        let r = e, n = this.getCh(r.channelID);
        if (n === void 0) {
          if (this.closed) return;
          continue;
        }
        await n.handle(r);
      }
    } catch (e) {
      if (e.message && e.message.contains && e.message.contains("Connection reset by peer")) return;
      throw e;
    }
  }
  async handleOpen(e) {
    if (e.maxPacketSize < Rt || e.maxPacketSize > _t) {
      await this.enc.encode({ ID: 102, channelID: e.senderID });
      return;
    }
    let r = this.newChannel();
    r.remoteId = e.senderID, r.maxRemotePayload = e.maxPacketSize, r.remoteWin = e.windowSize, r.maxIncomingPayload = Xe, this.incoming.push(r), await this.enc.encode({ ID: 101, channelID: r.remoteId, senderID: r.localId, windowSize: r.myWindow, maxPacketSize: r.maxIncomingPayload });
  }
  newChannel() {
    let e = new Ze(this);
    return e.remoteWin = 0, e.myWindow = fr, e.localId = this.addCh(e), e;
  }
  getCh(e) {
    let r = this.channels[e];
    return r && r.localId !== e && console.log("bad ids:", e, r.localId, r.remoteId), r;
  }
  addCh(e) {
    return this.channels.forEach((r, n) => {
      if (r === void 0) return this.channels[n] = e, n;
    }), this.channels.push(e), this.channels.length - 1;
  }
  rmCh(e) {
    delete this.channels[e];
  }
};
var Xe = 1 << 24;
var fr = 64 * Xe;
var Ze = class {
  localId;
  remoteId;
  maxIncomingPayload;
  maxRemotePayload;
  session;
  ready;
  sentEOF;
  sentClose;
  remoteWin;
  myWindow;
  readBuf;
  writers;
  constructor(e) {
    this.localId = 0, this.remoteId = 0, this.maxIncomingPayload = 0, this.maxRemotePayload = 0, this.sentEOF = false, this.sentClose = false, this.remoteWin = 0, this.myWindow = 0, this.ready = new pe(), this.session = e, this.writers = [], this.readBuf = new $e();
  }
  ident() {
    return this.localId;
  }
  async read(e) {
    let r = await this.readBuf.read(e);
    if (r !== null) try {
      await this.adjustWindow(r);
    } catch (n) {
      if (n !== "EOF" && n.name !== "BadResource") throw n;
    }
    return r;
  }
  write(e) {
    return this.sentEOF ? Promise.reject("EOF") : new Promise((r, n) => {
      let s = 0, o = () => {
        if (this.sentEOF || this.sentClose) {
          n("EOF");
          return;
        }
        if (e.byteLength == 0) {
          r(s);
          return;
        }
        let l = Math.min(this.maxRemotePayload, e.length), m = this.reserveWindow(l);
        if (m == 0) {
          this.writers.push(o);
          return;
        }
        let g = e.slice(0, m);
        this.send({ ID: 104, channelID: this.remoteId, length: g.length, data: g }).then(() => {
          if (s += g.length, e = e.slice(g.length), e.length == 0) {
            r(s);
            return;
          }
          this.writers.push(o);
        });
      };
      o();
    });
  }
  reserveWindow(e) {
    return this.remoteWin < e && (e = this.remoteWin), this.remoteWin -= e, e;
  }
  addWindow(e) {
    for (this.remoteWin += e; this.remoteWin > 0; ) {
      let r = this.writers.shift();
      if (!r) break;
      r();
    }
  }
  async closeWrite() {
    this.sentEOF = true, await this.send({ ID: 105, channelID: this.remoteId }), this.writers.forEach((e) => e()), this.writers = [];
  }
  async close() {
    if (this.readBuf.eof(), !this.sentClose) {
      for (await this.send({ ID: 106, channelID: this.remoteId }), this.sentClose = true; await this.ready.shift() !== null; ) ;
      return;
    }
    this.shutdown();
  }
  shutdown() {
    this.readBuf.close(), this.writers.forEach((e) => e()), this.ready.close(), this.session.rmCh(this.localId);
  }
  async adjustWindow(e) {
    this.myWindow += e, await this.send({ ID: 103, channelID: this.remoteId, additionalBytes: e });
  }
  send(e) {
    if (this.sentClose) throw "EOF";
    return this.sentClose = e.ID === 106, this.session.enc.encode(e);
  }
  handle(e) {
    if (e.ID === 104) {
      this.handleData(e);
      return;
    }
    if (e.ID === 106) {
      this.close();
      return;
    }
    if (e.ID === 105 && this.readBuf.eof(), e.ID === 102) {
      this.session.rmCh(e.channelID), this.ready.push(false);
      return;
    }
    if (e.ID === 101) {
      if (e.maxPacketSize < Rt || e.maxPacketSize > _t) throw "invalid max packet size";
      this.remoteId = e.senderID, this.maxRemotePayload = e.maxPacketSize, this.addWindow(e.windowSize), this.ready.push(true);
      return;
    }
    e.ID === 103 && this.addWindow(e.additionalBytes);
  }
  handleData(e) {
    if (e.length > this.maxIncomingPayload) throw "incoming packet exceeds maximum payload size";
    if (this.myWindow < e.length) throw "remote side wrote too much";
    this.myWindow -= e.length, this.readBuf.write(e.data);
  }
};
var Bt = {};
yr(Bt, { Conn: () => Qe, connect: () => $r });
function $r(t2, e) {
  return new Promise((r) => {
    let n = new WebSocket(t2);
    n.onopen = () => r(new Qe(n)), e && (n.onclose = e);
  });
}
var Qe = class {
  ws;
  waiters;
  chunks;
  isClosed;
  constructor(e) {
    this.isClosed = false, this.waiters = [], this.chunks = [], this.ws = e, this.ws.binaryType = "arraybuffer", this.ws.onmessage = (n) => {
      let s = new Uint8Array(n.data);
      if (this.chunks.push(s), this.waiters.length > 0) {
        let o = this.waiters.shift();
        o && o();
      }
    };
    let r = this.ws.onclose;
    this.ws.onclose = (n) => {
      r && r.bind(this.ws)(n), this.close();
    };
  }
  read(e) {
    return new Promise((r) => {
      var n = () => {
        if (this.isClosed) {
          r(null);
          return;
        }
        if (this.chunks.length === 0) {
          this.waiters.push(n);
          return;
        }
        let s = 0;
        for (; s < e.length; ) {
          let o = this.chunks.shift();
          if (o == null) {
            r(s);
            return;
          }
          let l = o.slice(0, e.length - s);
          if (e.set(l, s), s += l.length, o.length > l.length) {
            let m = o.slice(l.length);
            this.chunks.unshift(m);
          }
        }
        r(s);
      };
      n();
    });
  }
  write(e) {
    return this.ws.send(e), Promise.resolve(e.byteLength);
  }
  close() {
    this.isClosed || (this.isClosed = true, this.waiters.forEach((e) => e()), this.ws.close());
  }
};
var Ft = class {
  port;
  waiters;
  chunks;
  isClosed;
  constructor(e) {
    this.isClosed = false, this.waiters = [], this.chunks = [], this.port = e, this.port.onmessage = (r) => {
      let n = new Uint8Array(r.data);
      if (this.chunks.push(n), this.waiters.length > 0) {
        let s = this.waiters.shift();
        s && s();
      }
    };
  }
  read(e) {
    return new Promise((r) => {
      var n = () => {
        if (this.isClosed) {
          r(null);
          return;
        }
        if (this.chunks.length === 0) {
          this.waiters.push(n);
          return;
        }
        let s = 0;
        for (; s < e.length; ) {
          let o = this.chunks.shift();
          if (o == null) {
            r(s);
            return;
          }
          let l = o.slice(0, e.length - s);
          if (e.set(l, s), s += l.length, o.length > l.length) {
            let m = o.slice(l.length);
            this.chunks.unshift(m);
          }
        }
        r(s);
      };
      n();
    });
  }
  write(e) {
    return this.port.postMessage(e, [e.buffer]), Promise.resolve(e.byteLength);
  }
  close() {
    this.isClosed || (this.isClosed = true, this.waiters.forEach((e) => e()), this.port.close());
  }
};

// src/web/extension.ts
async function activate(context) {
  if (typeof navigator !== "object") {
    console.error("not running in browser");
    return;
  }
  const channel = new MessageChannel();
  self.postMessage({ type: "_port", port: channel.port2 }, [channel.port2]);
  const sess = new Je(new Ft(channel.port1));
  const peer = new je(sess, new ir());
  peer.respond();
  const fs = new HostFS(peer);
  context.subscriptions.push(fs);
  const terminal = createTerminal(peer);
  terminal.show();
}
function createTerminal(peer) {
  const writeEmitter = new vscode.EventEmitter();
  let channel = void 0;
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const pty = {
    onDidWrite: writeEmitter.event,
    open: () => {
      (async () => {
        const resp = await peer.call("vscode.Terminal");
        channel = resp.channel;
        const b = new Uint8Array(1024);
        let gotEOF = false;
        while (gotEOF === false) {
          const n = await channel.read(b);
          if (n === null) {
            gotEOF = true;
          } else {
            writeEmitter.fire(dec.decode(b.subarray(0, n)));
          }
        }
      })();
    },
    close: () => {
      if (channel) {
        channel.close();
      }
    },
    handleInput: (data) => {
      if (channel) {
        channel.write(enc.encode(data));
      }
    }
  };
  return vscode.window.createTerminal({ name: `Shell`, pty });
}
//# sourceMappingURL=extension.js.map
