declare const clientRuntime: {
  createClient: typeof import("@libsql/client").createClient;
};

export = clientRuntime;
