/* Magic Mirror
 * Module: MMM-FreeBox4G
 *
 * By @bugsounet
 * MIT Licensed.
 */

FB4G = (...arg) => { /* do nothing */ }

Module.register("MMM-FreeBox4G", {

  defaults: {
    debug: false,
    dev: false,
    updateInterval: "5s",
    router: {
      ip: "192.168.8.1",
      password: "admin"
    },
    display: {
      activeOnly: false,
      Icon: true,
      Button: true,
      BandWidth: true,
      Rate: true,
      Client: true,
      ClientIP: true,
      ClientCnxType: true,
      Conso: true,
      Used: true
    },
    text: {
      reseau: "Réseau",
      debit: "Débit Actuel:",
      conso: "Consomation Actuel:",
      used: "Consomation Total:"
    },
    clients: [],
    excludeMac: [],
    sortBy: "device",
    textWidth: 250,
  },

  start: function () {
    if (this.config.debug) FB4G = (...arg) => { console.log("[FreeBox4G]", ...arg) }
    this.FB4G = {
      "Hidden": true,
      "Cache": {},
      "Clients": {},
      "InfoCnx": {},
      "Traffic": {},
      "Conso": {}
    }
    this.Init = false
    this.error = null
    console.log("[FreeBox4G] Started...")
  },

  getDom: function() {
    var client = this.FB4G.Cache
    var wrapper = document.createElement("div")

    if (!this.Init) {
      wrapper.id = "FB4G_LOADING"
      wrapper.innerHTML = this.error ? this.error : this.translate("LOADING")
      var free = document.createElement("div")
      free.id = "FB4G_LOGO"
      wrapper.appendChild(free)
    } else {
      wrapper.innerHTML = ""
      /** on prepare le DOM en cachant tout **/

      /** Affichage de la bande passante **/
      var bandWidth = document.createElement("div")
      bandWidth.id = "FB4G_BAND"
      bandWidth.classList.add("hidden")

      var bandWidthIcon = document.createElement("div")
      bandWidthIcon.className = "bandwidth"
      bandWidthIcon.classList.add("hidden")
      bandWidthIcon.id= "FB4G_SIGNAL"
      bandWidth.appendChild(bandWidthIcon)

      var bandWidthDisplay= document.createElement("div")
      bandWidthDisplay.id = "FB4G_VALUE"
      bandWidth.appendChild(bandWidthDisplay)

      wrapper.appendChild(bandWidth)

      /** appareils connecté selon cache **/
      if (Object.keys(client).length > 0) {
        for (let [item, value] of Object.entries(client)) {
          var id = item
          var type = value.type
          var name = value.name
          var ssid = value.ssid

          var client = document.createElement("div")
          client.id = "FB4G_CLIENT"
          client.className = id
          client.classList.add("hidden")

          var clientIcon = document.createElement("div")
          clientIcon.id = "FB4G_ICON"
          clientIcon.className= "black"
          clientIcon.classList.add("hidden")
          client.appendChild(clientIcon)

          var clientName = document.createElement("div")
          clientName.id = "FB4G_NAME"
          clientName.style.width = this.config.display.ClientIP ? this.config.textWidth-80 + "px" : this.config.textWidth + "px"
          clientName.textContent = null // setName
          client.appendChild(clientName)

          var clientIP = document.createElement("div")
          clientIP.id = "FB4G_CLIENTIP"
          clientIP.classList.add("hidden")
          client.appendChild(clientIP)

          var clientCnxType= document.createElement("div")
          clientCnxType.id = "FB4G_ACCESS"
          clientCnxType.className = "black"
          clientCnxType.classList.add("hidden")
          client.appendChild(clientCnxType)

          var clientStatus = document.createElement("div")
          clientStatus.className = "switch"
          clientStatus.classList.add("hidden")

          var clientButton = document.createElement("INPUT")
          clientButton.id = "switched"
          clientButton.type = "checkbox"
          clientButton.className = "switch-toggle switch-round";
          clientButton.checked = false
          clientButton.disabled = true

          var clientLabel = document.createElement('label')
          clientLabel.htmlFor = "swithed"

          clientStatus.appendChild(clientButton)
          clientStatus.appendChild(clientLabel)

          client.appendChild(clientStatus)
          wrapper.appendChild(client)
        }
      }

      /** debit utilisé **/
      var debit = document.createElement("div")
      debit.id = "FB4G_DEBIT"
      debit.classList.add("hidden")
      var debitIcon = document.createElement("div")
      debitIcon.id = "FB4G_STATS"
      debitIcon.className = "stats"
      debitIcon.classList.add("hidden")
      debit.appendChild(debitIcon)
      var debitText = document.createElement("div")
      debitText.id = "FB4G_TEXT"
      debitText.textContent = this.config.text.debit
      debit.appendChild(debitText)
      var debitDisplay = document.createElement("div")
      debitDisplay.id = "FB4G_VALUE"

      debit.appendChild(debitDisplay)
      wrapper.appendChild(debit)

      /** conso **/
      var conso = document.createElement("div")
      conso.id = "FB4G_CONSO"
      conso.classList.add("hidden")
      var consoIcon = document.createElement("div")
      consoIcon.id = "FB4G_STATS"
      consoIcon.className = "stats"
      consoIcon.classList.add("hidden")
      conso.appendChild(consoIcon)
      var consoText = document.createElement("div")
      consoText.id = "FB4G_TEXT"
      consoText.textContent = this.config.text.conso
      conso.appendChild(consoText)
      var consoDisplay = document.createElement("div")
      consoDisplay.id = "FB4G_VALUE"

      conso.appendChild(consoDisplay)
      wrapper.appendChild(conso)

      /** utilisation **/
      var use = document.createElement("div")
      use.id = "FB4G_USE"
      use.classList.add("hidden")
      var useIcon = document.createElement("div")
      useIcon.id= "FB4G_STATS"
      useIcon.className = "stats"
      useIcon.classList.add("hidden")
      use.appendChild(useIcon)
      var useText = document.createElement("div")
      useText.id = "FB4G_TEXT"
      useText.textContent = this.config.text.used
      use.appendChild(useText)
      var useDisplay = document.createElement("div")
      useDisplay.id = "FB4G_VALUE"

      use.appendChild(useDisplay)
      wrapper.appendChild(use)
    }
    return wrapper
  },

  displayDom: function() {
    /** On applique les mises a jour en live ! **/

    if (Object.keys(this.FB4G.Cache).length != this.FB4G.Clients.length) {
      /** Nouveau Client connecté -> rebuild du cache **/
      FB4G("Rechargement du cache.")
      return this.sendSocketNotification("CACHE")
    }

    /** Bande Passante **/
    var bandWidth = document.getElementById("FB4G_BAND")
    var bandWidthIcon = bandWidth.querySelector("#FB4G_SIGNAL")

    var bandWidthValue = bandWidth.querySelector("#FB4G_VALUE")
    if (this.config.display.Icon) bandWidthIcon.classList.remove("hidden")
    if (this.config.display.BandWidth) bandWidth.classList.remove("hidden")
    bandWidthValue.textContent = this.config.text.reseau + " "
    bandWidthValue.textContent += (this.FB4G.InfoCnx.name ? (this.FB4G.InfoCnx.name + " " + this.FB4G.InfoCnx.cnx + this.FB4G.InfoCnx.ext) : "Aucun Service")
    bandWidthValue.textContent += this.FB4G.InfoCnx.connected ? "" : " (Déconnecté)"
    bandWidthIcon.className = "signal"+this.FB4G.InfoCnx.signal

    /** Appareils connecté **/
    this.FB4G.Clients.forEach(client => {
      var mac = client.mac
      var cache = this.FB4G.Cache[mac]
      var excludeMac = this.config.excludeMac

      var clientSelect = document.getElementsByClassName(mac)[0]
      var clientName = clientSelect.querySelector("#FB4G_NAME")
      clientName.textContent = cache.name

      /** Affichage IP **/
      var clientIP = clientSelect.querySelector("#FB4G_CLIENTIP")
      clientIP.textContent = client.ip ? client.ip.split(";")[0] : ""
      if (this.config.display.ClientIP) clientIP.classList.remove("hidden")

      /** Wifi ou Eth ? **/
      var clientAccess = clientSelect.querySelector("#FB4G_ACCESS")
      if (this.config.display.ClientCnxType) {
        clientAccess.classList.remove("hidden")
        if (client.active) {
          if (client.type == "Ethernet") clientAccess.className= "ethernet"
          else if (client.wifi == "2") clientAccess.className ="wifi2"
          else if (client.wifi == "5") clientAccess.className ="wifi5"
          else clientAccess.className = "black"
        }
        else clientAccess.className = "black"
      }

      /** bouton **/
      var clientStatus = clientSelect.querySelector("INPUT")
      var clientBouton = clientSelect.querySelector(".switch")
      var clientIcon = clientSelect.querySelector("#FB4G_ICON")
      if (this.config.display.Button) clientBouton.classList.remove("hidden")
      clientStatus.checked = client.active
      clientIcon.className= cache.device + (client.active ? "1": "0")
      if (this.config.display.Icon) clientIcon.classList.remove("hidden")
      else clientIcon.classList.add("hidden")

      /** Exclude @mac **/
      if (cache.show && excludeMac.indexOf(mac) == "-1") {
        if (this.config.display.activeOnly && client.active) clientSelect.classList.remove("hidden")
        else if (!this.config.display.activeOnly) clientSelect.classList.remove("hidden")
      }

      /** activeOnly **/
      if (this.config.display.activeOnly && !client.active ) clientSelect.classList.add("hidden")
    })

    /** Affichage Débit utilisé en temps réél **/
    var debit = document.getElementById("FB4G_DEBIT")
    var debitIcon = debit.querySelector("#FB4G_STATS")
    var debitValue = debit.querySelector("#FB4G_VALUE")
    if (this.config.display.Icon) debitIcon.classList.remove("hidden")
    if (this.config.display.Rate) debit.classList.remove("hidden")
    debitValue.textContent = this.FB4G.Traffic.down + " - " + this.FB4G.Traffic.up

    /** Affichage Conso utilisé **/
    var conso = document.getElementById("FB4G_CONSO")
    var consoIcon = conso.querySelector("#FB4G_STATS")
    var consoValue = conso.querySelector("#FB4G_VALUE")
    if (this.config.display.Icon) consoIcon.classList.remove("hidden")
    if (this.config.display.Conso) conso.classList.remove("hidden")
    consoValue.textContent = this.FB4G.Conso.up + " - " + this.FB4G.Conso.down

    /** Utilisation reseau **/
    var use = document.getElementById("FB4G_USE")
    var useIcon = use.querySelector("#FB4G_STATS")
    var useValue = use.querySelector("#FB4G_VALUE")
    if (this.config.display.Icon) useIcon.classList.remove("hidden")
    if (this.config.display.Used) use.classList.remove("hidden")
    useValue.textContent = this.FB4G.Conso.totalUsed + " / " + this.FB4G.Conso.totalAllowed + " (" + this.FB4G.Conso.usedPercent + ")"
 },

  notificationReceived: function (notification, payload) {
    switch(notification) {
      case "ALL_MODULES_STARTED":
        this.sendSocketNotification("INIT", this.config)
        break
    }
  },

  socketNotificationReceived: function (notification, payload) {
    switch (notification) {
      case "INITIALIZED":
        this.Init = true
        break
      case "CACHE":
        this.error = null
        this.cache(payload)
        break
      case "DATA":
        this.result(payload)
        break
      case "ERROR":
        this.Init = false
        this.error = payload
        console.log("[FreeBox4G] Error:", payload)
        this.updateDom()
        break
      case "info":
        FB4G("DATA:", payload)
    }
  },

  cache: function(payload) {
    this.FB4G.Cache = payload
    FB4G("Cache:", this.FB4G.Cache)
    this.Init = true
    this.hideFB4G()
  },

  hideFB4G: function() {
    this.FB4G.Hidden = true
    this.hide(200, this.callbackHide(), {lockString: "FREEBOX_LOCKED"})
    FB4G("Hide module")
  },

  callbackHide: function () {
    this.updateDom()
  },

  showFB4G: function() {
    this.FB4G.Hidden = false
    FB4G("Show module")
    this.show(200, {lockString: "FREEBOX_LOCKED"})
  },

  result: function(payload) {
    this.FB4G.Clients = payload.Clients
    this.FB4G.InfoCnx= payload.InfoCnx
    this.FB4G.Traffic= payload.Traffic
    this.FB4G.Conso= payload.Conso
    FB4G("Result:", this.FB4G)
    this.displayDom()
    if (this.FB4G.Hidden) this.showFB4G()
  },

  getStyles: function() {
    return ["MMM-FreeBox4G.css"]
  }

});
