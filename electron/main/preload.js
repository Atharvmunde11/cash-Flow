const { contextBridge, ipcRenderer } = require("electron");



contextBridge.exposeInMainWorld("cashflow", {

  saveBillPdf: async (args) => ipcRenderer.invoke("cashflow:save-bill-pdf", args),

  getAppVersion: () => ipcRenderer.invoke("cashflow:get-app-version"),

  checkForUpdates: () => ipcRenderer.invoke("cashflow:check-for-updates"),

  downloadUpdate: () => ipcRenderer.invoke("cashflow:download-update"),

  quitAndInstall: () => ipcRenderer.invoke("cashflow:quit-and-install"),

  onUpdateStatus: (callback) => {

    const listener = (_event, payload) => callback(payload);

    ipcRenderer.on("cashflow:update-status", listener);

    return () => ipcRenderer.removeListener("cashflow:update-status", listener);

  },

});

