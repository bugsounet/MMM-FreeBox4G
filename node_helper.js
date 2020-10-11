/* Magic Mirror
 * Module: MMM-FreeBox4G
 *
 * By @bugsounet
 * MIT Licensed.
 */

const NodeHelper = require('node_helper');
const Router = require("@bugsounet/api-freebox4G");
log = (...args) => { /* do nothing */ };

module.exports = NodeHelper.create({
  start: function() {
    console.log("[FreeBox4G] Starting...")
    this.router = null
    this.token = null
    this.data = {}
    this.cache = {}
    this.interval = null
    this.retry = null
    this.FB4G = {
      Clients: [],
      InfoCnx: {}
    }
  },

  initialize: async function() {
    console.log("[FreeBox4G] MMM-FreeBox4G Version:", require('./package.json').version)
    this.updateIntervalMilliseconds = this.getUpdateIntervalMillisecondFromString(this.config.updateInterval)
    this.router = Router.create({ip: this.config.router.ip, password: this.config.router.password})
    await this.freebox()

  },

  freebox: async function() {
    await this.router.getToken((error, token) => {
      this.token = token
      if (this.token) {
        this.router.login(this.token, async (err) => {
          if (err) this.displayErr(err)
          else {
            log("Login!")
            await this.fetchData(resolve => this.makeResult())
          }
        })
      } else this.displayErr(error.code)
    })
  },

  displayErr: function(err) {
    clearInterval(this.interval)
    clearTimeout(this.retry)
    console.log("[FreeBox4G] Error", err)
    console.log("[FreeBox4G] Retry in 60 secs...")
    this.sendSocketNotification("ERROR", "Erreur: " + err)
    this.cache = {}
    this.retry = setTimeout(() => this.freebox(), 1000 * 60)
  },

  fetchData: async function(resolve) {
    await this.getAllClients()
    await this.getMonthStatistics()
    await this.getStatus()
    await this.getTrafficStatistics()
    await this.getBasicSettings()
    await this.getCurrentPLMN()
    await this.getInformation()
    await this.getSignal()
    await this.getConnexion()
    this.scheduleUpdate()
    resolve()
  },

  makeCache: function() {
    // Je considere qu'il y a au moins un appareil de connecté
    this.data.clients.Hosts[0].Host.forEach(client => {
      var Mac = client.MacAddress[0]
      var replace = {
        name: null,
        device: null
      }
      this.config.clients.forEach(force => {
        if (Mac == force.mac) {
          if (force.name) replace.name = force.name
          if (force.device) replace.device = force.device
        }
      })
      this.cache[Mac] = {
        name: replace.name ? replace.name : (client.HostName[0] ? client.HostName[0] : Mac),
        type: client.InterfaceType[0],
        ssid: client.AssociatedSsid[0],
        device: replace.device? replace.device : "unknow",
        show:  this.config.display.Client? this.config.display.Client : false
      }
    })
    this.cache = this.sortBy(this.cache, this.config.display.sortBy)
    this.sendSocketNotification("CACHE", this.cache)
    log("Cache Created.")
    this.makeResult()
  },

  makeResult: function() {
    if (Object.keys(this.cache).length == 0) this.makeCache()
    else {
      this.FB4G.Clients = []
      var device = {}
      var wifi2Ghz = this.data.setting.WifiSsid[0]

      /** Client connecté **/
      this.data.clients.Hosts[0].Host.forEach(client => {
        device = {
          mac: client.MacAddress[0],
          name: client.HostName[0] ? client.HostName[0] : "(Appareil sans nom)",
          ip: client.IpAddress[0],
          type: client.InterfaceType[0],
          active: client.Active[0] == "1" ? true: false,
          ssid: client.AssociatedSsid[0],
          wifi: client.InterfaceType[0] == "Wireless" ? (client.AssociatedSsid[0] == wifi2Ghz ? "2" : "5") : null
        }
        this.FB4G.Clients.push(device)
      })

      /** Info  connexion **/
      this.FB4G.InfoCnx = {
        name: this.data.PLMN.FullName[0],
        cnx: this.data.info.workmode[0] == "LTE" ? "4G" : (this.data.info.workmode[0] == "WCDMA" ? "3G" : "2G"),
        signal: this.data.status.SignalIcon[0],
        ext: this.data.status.CurrentNetworkTypeEx > 1000 ? "+" : "",
        connected: this.data.connexion.dataswitch[0] == "1" ? true : false
      }

      /** Info Traffic **/
      this.FB4G.Traffic= {
        up: this.convert(10* Number(this.data.traffic.CurrentUploadRate[0]),2,1),
        down: this.convert(10* Number(this.data.traffic.CurrentDownloadRate[0]),2,1),
      }

      /** Info conso du mois **/
      this.FB4G.Conso= {
        up: this.convert(Number(this.data.stats.CurrentMonthDownload[0]),2,2),
        down: this.convert(Number(this.data.stats.CurrentMonthUpload[0]),2,2),
        total:  this.convert( Number(this.data.stats.CurrentMonthDownload[0]) + Number(this.data.stats.CurrentMonthUpload[0]), 2 ,2),
        totalUsed: this.convert((Number(this.data.stats.CurrentMonthDownload[0]) + Number(this.data.stats.CurrentMonthUpload[0])),2,2),
        totalAllowed: this.convert(Number(this.data.signal.trafficmaxlimit[0]),0,2),
        usedPercent: (((Number(this.data.stats.CurrentMonthDownload[0]) + Number(this.data.stats.CurrentMonthUpload[0])) * 100) / this.data.signal.trafficmaxlimit[0]).toFixed(2) + "%"
      }

      /** Send Datas ! **/
      this.sendSocketNotification("DATA", this.FB4G)
      if (this.config.dev)  {
        this.sendSocketNotification("info", this.data)
        console.log(this.FB4G)
      }
    }
  },

  socketNotificationReceived: function(notification, payload) {
    switch(notification) {
      case "INIT":
        this.config = payload
        if (this.config.debug) {
          log = (...args) => { console.log("[FreeBox4G]", ...args) }
        }
        this.initialize()
        break
      case "CACHE":
        this.rebuildCache()
        break
    }
  },

  rebuildCache: async function () {
    clearInterval(this.interval)
    this.cache = {}
    await this.fetchData(resolve => this.makeResult())
  },

  /** update process **/
  scheduleUpdate: function(delay) {
    let nextLoad = this.updateIntervalMilliseconds
    if (typeof delay !== "undefined" && delay >= 0) {
      nextLoad = delay
    }
    clearInterval(this.interval)
    this.interval = setInterval(async () => {
      if (await this.isLoggedIn()) {
        await this.fetchData(resolve => this.makeResult())
        log("Data updated.")
      }
    }, nextLoad)
  },

  /** Promise Data **/
  getAllClients: function() {
    return new Promise((resolve) => {
      this.router.getAllClients(this.token, (err, chosts) => {
        if (!err) this.data.clients = chosts
        resolve()
      })
    })
  },

  getSignal: function() {
    return new Promise((resolve) => {
      this.router.getSignal(this.token, (err, signal) => {
        if (!err) this.data.signal = signal
        resolve()
      })
    })
  },

  getMonthStatistics: function() {
    return new Promise((resolve) => {
      this.router.getMonthStatistics(this.token, (err, result) => {
        if (!err) this.data.stats = result
        resolve()
      })
    })
  },

  getStatus: function() {
    return new Promise((resolve) => {
      this.router.getStatus(this.token, (err, result) => {
        if (!err) this.data.status = result
        resolve()
      })
    })
  },

  getTrafficStatistics: function() {
    return new Promise((resolve) => {
      this.router.getTrafficStatistics(this.token, (err, result) => {
        if (!err) this.data.traffic = result
        resolve()
      })
    })
  },

  getBasicSettings: function() {
    return new Promise((resolve) => {
      this.router.getBasicSettings(this.token, (err, result) => {
        if (!err) this.data.setting = result
        resolve()
      })
    })
  },

  getCurrentPLMN: function() {
    return new Promise((resolve) => {
      this.router.getCurrentPLMN(this.token, (err, result) => {
        if (!err) this.data.PLMN = result
        resolve()
      })
    })
  },

  getInformation: function() {
    return new Promise((resolve) => {
      this.router.getInformation(this.token, (err, result) => {
        if (!err) this.data.info = result
        resolve()
      })
    })
  },

  getConnexion: function() {
    return new Promise((resolve) => {
      this.router.getConnexion(this.token, (err, result) => {
        if (!err) this.data.connexion = result
        resolve()
      })
    })
  },

  isLoggedIn: function() {
    return new Promise((resolve) => {
      this.router.isLoggedIn(this.token, (err, result) => {
        if (!result) this.displayErr(err.code)
        return resolve(result ? true : false)
      })
    })
  },


  /** ***** **/
  /** Tools **/
  /** ***** **/

  /** convert h m s to ms **/
  getUpdateIntervalMillisecondFromString: function(intervalString) {
   let regexString = new RegExp("^\\d+[smhd]{1}$")
   let updateIntervalMillisecond = 0

   if (regexString.test(intervalString)){
     let regexInteger = "^\\d+"
     let integer = intervalString.match(regexInteger)
     let regexLetter = "[smhd]{1}$"
     let letter = intervalString.match(regexLetter)

     let millisecondsMultiplier = 1000
      switch (String(letter)) {
        case "s":
          millisecondsMultiplier = 1000
          break
        case "m":
          millisecondsMultiplier = 1000 * 60
          break
        case "h":
          millisecondsMultiplier = 1000 * 60 * 60
          break
        case "d":
          millisecondsMultiplier = 1000 * 60 * 60 * 24
          break
      }
      // convert the string into seconds
      updateIntervalMillisecond = millisecondsMultiplier * integer
    } else {
      updateIntervalMillisecond = 1000 * 60 * 60 * 24
    }
    return updateIntervalMillisecond
  },

  /** converti les octets en G/M/K
   * octects, precision, type
   * type 0: pas d'unité
   * type 1: Octets/s
   * type 2: Bytes/s
  **/
  convert: function(octet,FixTo, type=0) {
    if (octet>(1024 * 1024 * 1024)){
      octet=(octet/(1024 * 1024 * 1024)).toFixed(FixTo)
      if (type) octet = octet + (type == 2 ? " Go" : " Gb/s")
    } else if (octet>(1024 * 1024)){
      octet=(octet/(1024 * 1024)).toFixed(FixTo)
      if (type) octet = octet + (type == 2 ? " Mo" : " Mb/s")
    } else if (octet>1024){
      octet=(octet/1024).toFixed(FixTo)
      if (type) octet = octet + (type == 2 ? " Ko" : " Kb/s")
    } else {
      if (type == 2) octet=octet + " o"
      else octet="0" + (type ? " Kb/s" : "")
    }
    return octet
  },

  /** Classe le resultat selon device, name ou mac **/
  sortBy: function (data, sort) {
    var result = {}
    /** sort by type or by name **/
    if (sort == "device" || sort == "name") {
      log("Sort cache by" , sort)
      var arr = []
      for (var mac in data) {
        if (data.hasOwnProperty(mac)) {
            var obj = {}
            obj[mac] = data[mac]
            obj.Sort = data[mac][sort] ? data[mac][sort].toLowerCase() : data[mac][sort]
            arr.push(obj)
        }
      }
      arr.sort((a, b)=> {
        var at = a.Sort
        var bt = b.Sort
        return at > bt ? 1 : ( at < bt ? -1 : 0 )
      })

      for (var i=0, l=arr.length; i<l; i++) {
        var obj = arr[i];
        delete obj.Sort
        for (var mac in obj) {
          if (obj.hasOwnProperty(mac)) {
              var id = mac
          }
        }
        result[mac] = obj[id]
      }
    } else if (sort == "mac") {
      /** sort by MAC **/
      log("Sort cache by", sort)
      var mac = Object.keys(data)
      mac.sort()
      mac.forEach((macSort)=> {
        result[macSort] = data[macSort]
      })
    } else {
      /** other return the same **/
      log("Cache not sorted")
      result = data
    }
    return result
  }

});
