var http = require('http');
var fetch = require('node-fetch');
var stores = require('./store.js');
var Accessory, Service, Characteristic, UUIDGen;

var host = "https://www.tih.tw"

module.exports = function(homebridge) {
  console.log("homebridge API version: " + homebridge.version);

  // Accessory must be created from PlatformAccessory Constructor
  Accessory = homebridge.platformAccessory;

  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  
  // For platform plugin to be considered as dynamic platform plugin,
  // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
  homebridge.registerPlatform("homebridge-maid-white", "Maid White", SamplePlatform, true);
}

// Platform constructor
// config may be null
// api may be null if launched from old homebridge version
function SamplePlatform(log, config, api) {
  log("SamplePlatform Init");
  var platform = this;
  this.log = log;
  this.config = config;
  this.accessories = [];
  this.deviceCache = {}
  log("Config: " + JSON.stringify(config))

  this.requestServer = http.createServer(function(request, response) {
    if (request.url === "/add") {
      this.addAccessory(new Date().toISOString());
      response.writeHead(204);
      response.end();
    }

    if (request.url == "/reachability") {
      this.updateAccessoriesReachability();
      response.writeHead(204);
      response.end();
    }

    if (request.url == "/remove") {
      this.removeAccessory();
      response.writeHead(204);
      response.end();
    }
  }.bind(this));

  this.requestServer.listen(18081, function() {
    platform.log("Server Listening...");
  });


  // this.addAccessory()

  if (api) {
      // Save the API object as plugin needs to register new accessory via this object
      this.api = api;

      // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
      // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
      // Or start discover new accessories.
      this.api.on('didFinishLaunching', function() {
        platform.log("DidFinishLaunching");

        this.DiscoveryDevices()


      }.bind(this));
  }

}


SamplePlatform.prototype.DiscoveryDevices = function() {
  const config = this.config
  const platform = this

  fetch(host + "/2/driver-info")
    .then(res => res.json())
    .then(json => {

      this.driverInfo = json;
      // log("driver-info", json)
      // log("config", config)

      if (config.accessToken == '') {
        const username = config['username']
        const password = config['password']
        fetch(host + "2/token", {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: "username=" + encodeURIComponent(username) + "&password=" + encodeURIComponent(password)+"&client_id=homebridge",
          })
          .then(res => res.json())
          .then(json => {
            log("get access token:", json)

            if (typeof(json['access_token']) != "undefined") {
              config['password'] = ""
              config['accessToken'] = json['access_token']
              log("replace confige with", config)
              this.config = config
            }
          })

      }else{
        this.accessToken = config["accessToken"]
        if (config['password'] && config['password'] != ""){
          log("warn, password should be removed")
        }

        fetch(host + "/2/homes",{
            method: "GET",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Authorization": "bearer " + this.accessToken,
          },
        })
        .then(res => res.json())
        .then(json => {
          platform.log("get homes: ", json)
          // this.removeAccessory()
          const homes = json["homes"]
          // devices.forEach(dev => {
          //   this.AddMaidWhiteDevice(dev)
          platform.homeId = ""
          for (var i = 0; i < homes.length; i++){
            const home = homes[i]

            if (home['id'] == platform.config["homeId"]) {
              platform.homeId = platform.config["homeId"]
              break
            }

            if (home['display_name'] == platform.config['homeName']) {
              platform.homeId = home["id"]
              break
            }
          }
          if (platform.homeId == "") {
            platform.log("warn:, setting home not found, will display all devices")
          }


          fetch(host + "/2/devices", {
              method: "GET",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": "bearer " + this.accessToken,
            },
            })
            .then(res => res.json())
            .then(json => {
              // log("get devices: ", json)
              // this.removeAccessory()
              const devices = json["devices"]
              devices.forEach(dev => {
                if (platform.homeId == "" || dev['home_id'] == platform.homeId ) {
                  this.AddMaidWhiteDevice(dev)
                }
              })

            })
        })
      }



  })

}

SamplePlatform.prototype.AddMaidWhiteDevice = function(device) {
  const driverInfo = this.driverInfo[device['driver_name']]
  this.log("found Maid White device:", device["display_name"], driverInfo['screen_type'])
  // if(this.driverInfo[] ==)
  var platform = this;
  var uuid;

  uuid = UUIDGen.generate(""+device["id"]);
  var found = false
  this.log("platform len:", (this.accessories.length))
  this.accessories.forEach(acc => {
    if (acc.UUID == uuid){
      found = true
      return
    }
  })

    this.log("found :", found)
  if (found){
    return
  }

  var newAccessory = new Accessory(device["display_name"], uuid);
  newAccessory.context = {
    id: device["id"],
    driverName: device["driver_name"],
    screenType: driverInfo["screen_type"],
  }

  // newAccessory.on('identify', function(paired, callback) {
  //   platform.log(newAccessory.displayName, "Identify!!!");
  //   callback();
  // });
  // Plugin can save context on accessory to help restore accessory in configureAccessory()
  // newAccessory.context.something = "Something"
  
  // Make sure you provided a name for service, otherwise it may not visible in some HomeKit apps


  switch (newAccessory.context.screenType){
    case "thermostat":
      newAccessory.addService(Service.Thermostat, device["display_name"])
      break;
    case "smartplug":
      newAccessory.addService(Service.Switch, device["display_name"])
      break;
  }
  this.configureAccessory(newAccessory)



  switch (newAccessory.context.screenType){
    case "thermostat":
    case "smartplug":
    this.api.registerPlatformAccessories("homebridge-maid-white", "Maid White", [newAccessory]);
      break;
  }


  // this.accessories.push(newAccessory);

}


// Function invoked when homebridge tries to restore cached accessory.
// Developer can configure accessory at here (like setup event handler).
// Update current value.
SamplePlatform.prototype.configureAccessory = function(accessory) {
  this.log(accessory.displayName, "Configure Accessory");
  var platform = this;

  switch (accessory.context.screenType) {
    case 'thermostat':
      this.ConfigureMaidWhiteThermostat(accessory)
      this.accessories.push(accessory);
      return
    case 'smartplug':
      this.ConfigureMaidWhiteSmartplug(accessory)
      this.accessories.push(accessory)
      return

    case 'hidden':
      return

  }
  return

  // Set the accessory to reachable if plugin can currently process the accessory,
  // otherwise set to false and update the reachability later by invoking 
  // accessory.updateReachability()
  accessory.reachable = true;

  accessory.on('identify', function(paired, callback) {
    platform.log(accessory.displayName, "Identify!!!");
    callback();
  });

  if (accessory.getService(Service.Lightbulb)) {
    accessory.getService(Service.Lightbulb)
    .getCharacteristic(Characteristic.On)
    .on('set', function(value, callback) {
      platform.log(accessory.displayName, "Light -> " + value);
      callback();
    });
  }else{

  }


  // this.api.unregisterPlatformAccessories("homebridge-maid-white", "Maid White", [accessory]);

  this.accessories.push(accessory);
}



SamplePlatform.prototype.ConfigureMaidWhiteThermostat = function(accessory) {
  this.log(accessory.displayName, "Configure Maid White Thermostat");
  var platform = this;
  const service = accessory.getService(Service.Thermostat)


  const onChar = service.getCharacteristic(Characteristic.On)

  onChar.on('set', function(value, callback) {
    platform.log(accessory.displayName, "Thermostat on -> " + value);
    if(value == 0){
      // turn off
      body = "power_status=false"
    }else{
      // turn on
      body = "power_status=true"
    }

    platform.setDevice(accessory, body, _ => {
      callback();
    });

  });

  onChar.on('change', function(oldValue, newValue){
    platform.log(accessory.displayName, "Thermostat on " + oldValue + " -> " + newValue);
  })
  onChar.on('get', function(callback){
    platform.log(accessory.displayName, "Thermostat on get:");
    callback(null, 0)
  })


  const modeChar = service.getCharacteristic(Characteristic.TargetHeatingCoolingState)

  modeChar.on('set', function(value, callback) {
    platform.log(accessory.displayName, "Thermostat mode -> " + value);
    body = ""
    if (value == 0 ){
      body = "power_status=false"
    }else{
      if (value == 2 ){
        body = "power_status=true&mode=cool"
      }else if (value == 1) {
        body = "power_status=true&mode=heat"

      }else{
        body = "power_status=true"
      }
    }

    platform.setDevice(accessory, body, _ => {
      callback();
    })
  });

  modeChar.on('change', function(oldValue, newValue){
    platform.log(accessory.displayName, "Thermostat mode " + oldValue + " -> " + newValue);
  })
  modeChar.on('get', function(callback){
    platform.log(accessory.displayName, "Thermostat mode get:");

    platform.fetchDeviceWithCache(accessory, data => {
      platform.log("got cached data: ", data)
      if(data["power_status"] == false || data['power_status'] == 'false'){
        callback(null, 0) 
      }else{
        if(typeof(data["mode"]) != "undefined"){
          switch (data["mode"]){
            case "cool":
              callback(null, 2)
              return;
            case "heat":
              callback(null, 1)
              return;
            case "auto":
              callback(null, 3)

              return;
          }
          callback(new Error("unknown mode: " +data["mode"]), 0)
        }else{
          callback(new Error("unknown mode"), 0)

        }
      }
    })
  })



  const targetChar = service.getCharacteristic(Characteristic.TargetTemperature)

  targetChar.on('set', function(value, callback) {
    platform.log(accessory.displayName, "Thermostat target temp -> " + value);
    platform.setDevice(accessory, "target_temperature_range=" + value, _ => {
      callback();
    })
  });

  targetChar.on('change', function(oldValue, newValue){
    platform.log(accessory.displayName, "Thermostat target temp " + oldValue + " -> " + newValue);
  })
  targetChar.on('get', function(callback){
    platform.log(accessory.displayName, "Thermostat target temp get:");
    platform.log("token", platform.accessToken)


    platform.fetchDeviceWithCache(accessory, data => {
        if(typeof(data["error_description"]) != 'undefined'){
          callback(new Error(data["error_description"]), null)
          return
        }
        if(typeof(data["target_temperature_range"]) == 'undefined'){
          callback(new Error("no target temperature"), null)
          return
        }
        callback(null, data["target_temperature_range"][0]) 
    })


  })


  const currentTempChar = service.getCharacteristic(Characteristic.CurrentTemperature)

  currentTempChar.on('change', function(oldValue, newValue){
    platform.log(accessory.displayName, "Thermostat current temp " + oldValue + " -> " + newValue);
  })
  currentTempChar.on('get', function(callback){
    platform.log(accessory.displayName, "Thermostat current temp get ", accessory.context);
    platform.log("token", platform.accessToken)

    platform.fetchDeviceWithCache(accessory, data => {

      if(typeof(data["error_description"]) != 'undefined'){
        callback(new Error(data["error_description"]))
        return
      }
      if(typeof(data["ambient_temperature"]) == 'undefined'){
        callback(new Error("no ambient temperature"))
        return
      }
      callback(null, data["ambient_temperature"]) 

    })


    // platform.fetchDevice(accessory, data => {
    // })

  })
}

SamplePlatform.prototype.ConfigureMaidWhiteSmartplug = function(accessory) {
  this.log(accessory.displayName, "Configure Maid White Smartplug");
  var platform = this;
  const service = accessory.getService(Service.Switch)
  const onChar = service.getCharacteristic(Characteristic.On)

  onChar.on('set', function(value, callback) {
    platform.log(accessory.displayName, "Smartplug on -> " + value);
    if(value == 0){
      // turn off
      body = "power_status=false"
    }else{
      // turn on
      body = "power_status=true"
    }

    platform.setDevice(accessory, body, _ => {
      callback();
    });

  });

  onChar.on('change', function(oldValue, newValue){
    platform.log(accessory.displayName, "Smartplug on " + oldValue + " -> " + newValue);
  })
  onChar.on('get', function(callback){
    platform.log(accessory.displayName, "Smartplug on get:");
    callback(null, 0)
  })

}

SamplePlatform.prototype.fetchDeviceWithCache = function(accessory, callback) {
  const platform = this
  if(typeof(platform.deviceCache[accessory.context.id]) != 'undefined' ){
    callback(platform.deviceCache[accessory.context.id])
    platform.fetchDevice(accessory, _ => {})
    return
  } 
  platform.fetchDevice(accessory, callback)
}

SamplePlatform.prototype.fetchDevice = function(accessory, callback) {
  const platform = this
  fetch(host + "/2/devices/" + accessory.context.id, {
      headers: {
        "Authorization": "bearer " + platform.accessToken,
      }
    })
    .then(res => res.json())
    .then(json => {
        platform.log(accessory.displayName, "Thermostat current temp get data ", json);

        if(json["online"] != 'undefined'){
          if(json["online"]){
            platform.log(accessory.displayName, "Thermostat notify online");
            accessory.updateReachability(true);
          }else{
            platform.log(accessory.displayName, "Thermostat notify offline");
            accessory.updateReachability(false);
          }
        }
        platform.deviceCache[accessory.context.id] = json
        callback(json)
    })
} 



SamplePlatform.prototype.setDevice = function(accessory, body, callback) {
  const platform = this
  fetch(host + "/2/devices/" + accessory.context.id, {
      method: "POST",
      headers: {
        "Authorization": "bearer " + platform.accessToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    })
    .then(res => res.json())
    .then(json => {
        platform.log(accessory.displayName, "post maid white data got:", json);

        if(json["online"] != 'undefined'){
          if(json["online"]){
            accessory.updateReachability(true);
          }else{
            accessory.updateReachability(false);
          }
        }

        callback(json)
    })
} 



// Handler will be invoked when user try to config your plugin.
// Callback can be cached and invoke when necessary.
SamplePlatform.prototype.configurationRequestHandler = function(context, request, callback) {
  this.log("Context: ", JSON.stringify(context));
  this.log("Request: ", JSON.stringify(request));

  // Check the request response
  if (request && request.response && request.response.inputs && request.response.inputs.name) {
    this.addAccessory(request.response.inputs.name);

    // Invoke callback with config will let homebridge save the new config into config.json
    // Callback = function(response, type, replace, config)
    // set "type" to platform if the plugin is trying to modify platforms section
    // set "replace" to true will let homebridge replace existing config in config.json
    // "config" is the data platform trying to save
    callback(null, "Maid White", true, {
      "platform":"Maid White",
      "otherConfig":"SomeData"
    });
    return;
  }

  // - UI Type: Input
  // Can be used to request input from user
  // User response can be retrieved from request.response.inputs next time
  // when configurationRequestHandler being invoked

  var respDict = {
    "type": "Interface",
    "interface": "input",
    "title": "Add Accessory",
    "items": [
      {
        "id": "name",
        "title": "Name",
        "placeholder": "Fancy Light"
      }//, 
      // {
      //   "id": "pw",
      //   "title": "Password",
      //   "secure": true
      // }
    ]
  }

  // - UI Type: List
  // Can be used to ask user to select something from the list
  // User response can be retrieved from request.response.selections next time
  // when configurationRequestHandler being invoked

  // var respDict = {
  //   "type": "Interface",
  //   "interface": "list",
  //   "title": "Select Something",
  //   "allowMultipleSelection": true,
  //   "items": [
  //     "A","B","C"
  //   ]
  // }

  // - UI Type: Instruction
  // Can be used to ask user to do something (other than text input)
  // Hero image is base64 encoded image data. Not really sure the maximum length HomeKit allows.

  // var respDict = {
  //   "type": "Interface",
  //   "interface": "instruction",
  //   "title": "Almost There",
  //   "detail": "Please press the button on the bridge to finish the setup.",
  //   "heroImage": "base64 image data",
  //   "showActivityIndicator": true,
  // "showNextButton": true,
  // "buttonText": "Login in browser",
  // "actionURL": "https://google.com"
  // }

  // Plugin can set context to allow it track setup process
  context.ts = "Hello";

  // Invoke callback to update setup UI
  callback(respDict);
}

// Sample function to show how developer can add accessory dynamically from outside event
SamplePlatform.prototype.addAccessory = function(accessoryName) {
  this.log("Add Accessory");
  var platform = this;
  var uuid;

  uuid = UUIDGen.generate(accessoryName);

  var newAccessory = new Accessory(accessoryName, uuid);
  newAccessory.on('identify', function(paired, callback) {
    platform.log(newAccessory.displayName, "Identify!!!");
    callback();
  });
  // Plugin can save context on accessory to help restore accessory in configureAccessory()
  // newAccessory.context.something = "Something"
  
  // Make sure you provided a name for service, otherwise it may not visible in some HomeKit apps
  newAccessory.addService(Service.Lightbulb, "Test Light")
  .getCharacteristic(Characteristic.On)
  .on('set', function(value, callback) {
    platform.log(newAccessory.displayName, "Light -> " + value);
    callback();
  });

  this.accessories.push(newAccessory);
  this.api.registerPlatformAccessories("homebridge-maid-white", "Maid White", [newAccessory]);
}

SamplePlatform.prototype.updateAccessoriesReachability = function() {
  this.log("Update Reachability");
  for (var index in this.accessories) {
    var accessory = this.accessories[index];
    accessory.updateReachability(false);
  }
}

// Sample function to show how developer can remove accessory dynamically from outside event
SamplePlatform.prototype.removeAccessory = function() {
  this.log("Remove Accessory");
  this.api.unregisterPlatformAccessories("homebridge-maid-white", "Maid White", this.accessories);

  this.accessories = [];
}