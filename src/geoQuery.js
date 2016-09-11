/**
 * Creates a GeoQuery instance.
 *
 * @constructor
 * @this {GeoQuery}
 * @param {Firebase} firebaseRef A Firebase reference.
 * @param {Object} queryCriteria The criteria which specifies the query's center and radius.
 */
var GeoQuery = function (firebase, firebaseDst, queryCriteria) {
  /*********************/
  /*  PRIVATE METHODS  */
  /*********************/
  /**
   * OK
   * Fires each callback for the provided eventType, passing it provided key's data.
   *
   * @param {string} eventType The event type whose callbacks to fire. One of "key_entered", "key_exited", or "key_moved".
   * @param {string} key The key of the location for which to fire the callbacks.
   * @param {?Array.<number>} location The location as [latitude, longitude] pair
   * @param {?double} distanceFromCenter The distance from the center or null.
   */
  function _fireCallbacksForKey(eventType, key, location, distanceFromCenter) {
    console.log("_fireCallbacksForKey: "+JSON.stringify(eventType)+" | "+JSON.stringify(key)+" | "+JSON.stringify(location)+" | "+JSON.stringify(distanceFromCenter));
    _callbacks[eventType].forEach(function(callback) {
      if (typeof location === "undefined" || location === null) {
        callback(key, null, null);
      }
      else {
        callback(key, location, distanceFromCenter);
      }
    });
  }


  /**
   * OK
   * Decodes a query string to a query
   *
   * @param {string} str The encoded query.
   * @return {Array.<string>} The decoded query as a [start, end] pair.
   */
  function _stringToQuery(string) {
    var decoded = string.split(":");
    if (decoded.length !== 2) {
      throw new Error("Invalid internal state! Not a valid geohash query: " + string);
    }
    return decoded;
  }

  /**
   * OK
   * Encodes a query as a string for easier indexing and equality.
   *
   * @param {Array.<string>} query The query to encode.
   * @param {string} The encoded query as string.
   */
  function _queryToString(query) {
    if (query.length !== 2) {
      throw new Error("Not a valid geohash query: " + query);
    }
    return query[0]+":"+query[1];
  }

  /**
   * OK
   * Turns off all callbacks for the provide geohash query.
   *
   * @param {Array.<string>} query The geohash query.
   * @param {Object} queryState An object storing the current state of the query.
   */
  function _cancelGeohashQuery(listeners, path) {
    firebase.removeEventListeners(listeners, path);
    
  }

  /**
   * OK
   * Removes unnecessary Firebase queries which are currently being queried.
   */
  function _cleanUpCurrentGeohashesQueried() {
    var keys = Object.keys(_currentGeohashesQueried);
    var numKeys = keys.length;
    for (var i = 0; i < numKeys; ++i) {
      var geohashQueryStr = keys[i];
      var queryResult = _currentGeohashesQueried[geohashQueryStr];
      if (queryResult.active === false) {
        // Delete the geohash since it should no longer be queried
        _cancelGeohashQuery(queryResult.listeners, queryResult.path);
        delete _currentGeohashesQueried[geohashQueryStr];
      }
    }

    // Delete each location which should no longer be queried
    keys = Object.keys(_locationsTracked);
    numKeys = keys.length;
    for (i = 0; i < numKeys; ++i) {
      var key = keys[i];
      if (!_geohashInSomeQuery(_locationsTracked[key].geohash)) {
        if (_locationsTracked[key].isInQuery) {
          throw new Error("Internal State error, trying to remove location that is still in query");
        }
        delete _locationsTracked[key];
      }
    }

    // Specify that this is done cleaning up the current geohashes queried
    _geohashCleanupScheduled = false;

    // Cancel any outstanding scheduled cleanup
    if (_cleanUpCurrentGeohashesQueriedTimeout !== null) {
      clearTimeout(_cleanUpCurrentGeohashesQueriedTimeout);
      _cleanUpCurrentGeohashesQueriedTimeout = null;
    }
  }

  /**
   * OK
   * Callback for any updates to locations. Will update the information about a key and fire any necessary
   * events every time the key's location changes.
   *
   * When a key is removed from GeoFire or the query, this function will be called with null and performs
   * any necessary cleanup.
   *
   * @param {string} key The key of the geofire location.
   * @param {?Array.<number>} location The location as [latitude, longitude] pair.
   */
  function _updateLocation(key, location) {
    console.log("_updateLocation: "+JSON.stringify(key)+" | "+JSON.stringify(location));
    validateLocation(location);
    // Get the key and location
    var distanceFromCenter, isInQuery;
    var wasInQuery = (_locationsTracked.hasOwnProperty(key)) ? _locationsTracked[key].isInQuery : false;
    var oldLocation = (_locationsTracked.hasOwnProperty(key)) ? _locationsTracked[key].location : null;

    // Determine if the location is within this query
    distanceFromCenter = GeoFire.distance(location, _center);
    console.log("distanceFromCenter: "+distanceFromCenter);
    isInQuery = (distanceFromCenter <= _radius);
    console.log("isInQuery: "+isInQuery);

    // Add this location to the locations queried dictionary even if it is not within this query
    _locationsTracked[key] = {
      location: location,
      distanceFromCenter: distanceFromCenter,
      isInQuery: isInQuery,
      geohash: encodeGeohash(location, g_GEOHASH_PRECISION)
    };
    console.log("_locationsTracked: "+JSON.stringify(_locationsTracked));

    // Fire the "key_entered" event if the provided key has entered this query
    if (isInQuery && !wasInQuery) {
      _fireCallbacksForKey("key_entered", key, location, distanceFromCenter);
    } else if (isInQuery && oldLocation !== null && (location[0] !== oldLocation[0] || location[1] !== oldLocation[1])) {
      _fireCallbacksForKey("key_moved", key, location, distanceFromCenter);
    } else if (!isInQuery && wasInQuery) {
      _fireCallbacksForKey("key_exited", key, location, distanceFromCenter);
    }
  }

  /**
   * OK
   * Checks if this geohash is currently part of any of the geohash queries.
   *
   * @param {string} geohash The geohash.
   * @param {boolean} Returns true if the geohash is part of any of the current geohash queries.
   */
  function _geohashInSomeQuery(geohash) {
    var keys = Object.keys(_currentGeohashesQueried);
    var numKeys = keys.length;
    for (var i = 0; i < numKeys; ++i) {
      var queryStr = keys[i];
      if (_currentGeohashesQueried.hasOwnProperty(queryStr)) {
        var query = _stringToQuery(queryStr);
        if (geohash >= query[0] && geohash <= query[1]) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * OK
   * Removes the location from the local state and fires any events if necessary.
   *
   * @param {string} key The key to be removed.
   * @param {?Array.<number>} currentLocation The current location as [latitude, longitude] pair
   * or null if removed.
   */
  function _removeLocation(key, currentLocation) {
    var locationDict = _locationsTracked[key];
    delete _locationsTracked[key];
    if (typeof locationDict !== "undefined" && locationDict.isInQuery) {
      var distanceFromCenter = (currentLocation) ? GeoFire.distance(currentLocation, _center) : null;
      _fireCallbacksForKey("key_exited", key, currentLocation, distanceFromCenter);
    }
  }

  /**
   * OK
   * Callback for child added events.
   *
   * @param {Firebase DataSnapshot} locationDataSnapshot A snapshot of the data stored for this location.
   */
  function _childAddedCallback(k,v) {
    console.log("_childAddedCallback(k,v): "+JSON.stringify(k)+" | "+JSON.stringify(v));
    _updateLocation(k, decodeGeoFireObject(v));
  }

  /**
   * OK
   * Callback for child changed events
   *
   * @param {Firebase DataSnapshot} locationDataSnapshot A snapshot of the data stored for this location.
   */
  function _childChangedCallback(k,v) {
    console.log("_childChangedCallback(k,v): "+JSON.stringify(k)+" | "+JSON.stringify(v));
    _updateLocation(k, decodeGeoFireObject(v));
  }

  /**
   * OK
   * Callback for child removed events
   *
   * @param {Firebase DataSnapshot} locationDataSnapshot A snapshot of the data stored for this location.
   */
  
  function _childRemovedCallback(k,v) {
    console.log("_childRemovedCallback(k,v): "+JSON.stringify(k)+" | "+JSON.stringify(v));
    if (_locationsTracked.hasOwnProperty(k)) {
      var location = v === null ? null : decodeGeoFireObject(v);
      var geohash = (location !== null) ? encodeGeohash(location) : null;
      // Only notify observers if key is not part of any other geohash query or this actually might not be
      // a key exited event, but a key moved or entered event. These events will be triggered by updates
      // to a different query
      if (!_geohashInSomeQuery(geohash)) {
        _removeLocation(k, location);
      }
    }
  }
  

  /**
   * OK
   * Attaches listeners to Firebase which track when new geohashes are added within this query's
   * bounding box.
   */
  function _listenForNewGeohashes() {
    console.log("_listenForNewGeohashes begin");
    // Get the list of geohashes to query
    var geohashesToQuery = geohashQueries(_center, _radius*1000).map(_queryToString);
    console.log("geohashesToQuery before: "+JSON.stringify(geohashesToQuery));
    // Filter out duplicate geohashes
    geohashesToQuery = geohashesToQuery.filter(function(geohash, i){
      return geohashesToQuery.indexOf(geohash) === i;
    });
    console.log("geohashesToQuery after: "+JSON.stringify(geohashesToQuery));

    // For all of the geohashes that we are already currently querying, check if they are still
    // supposed to be queried. If so, don't re-query them. Otherwise, mark them to be un-queried
    // next time we clean up the current geohashes queried dictionary.
    console.log("_currentGeohashesQueried: "+JSON.stringify(_currentGeohashesQueried));
    var keys = Object.keys(_currentGeohashesQueried);
    var numKeys = keys.length;
    for (var i = 0; i < numKeys; ++i) {
      var geohashQueryStr = keys[i];
      console.log("geohashQueryStr: "+JSON.stringify(geohashQueryStr));
      var index = geohashesToQuery.indexOf(geohashQueryStr);
      console.log("index: "+JSON.stringify(index));
      if (index === -1) {
        _currentGeohashesQueried[geohashQueryStr].active = false;
      }
      else {
        _currentGeohashesQueried[geohashQueryStr].active = true;
        geohashesToQuery.splice(index, 1);
      }
    }

    // If we are not already cleaning up the current geohashes queried and we have more than 25 of them,
    // kick off a timeout to clean them up so we don't create an infinite number of unneeded queries.
    if (_geohashCleanupScheduled === false && Object.keys(_currentGeohashesQueried).length > 25) {
      _geohashCleanupScheduled = true;
      _cleanUpCurrentGeohashesQueriedTimeout = setTimeout(_cleanUpCurrentGeohashesQueried, 10);
    }

    
    // Loop through each geohash to query for and listen for new geohashes which have the same prefix.
    // For every match, attach a value callback which will fire the appropriate events.
    // Once every geohash to query is processed, fire the "ready" event.
    geohashesToQuery.forEach(function(toQueryStr) {
      // decode the geohash query string
      var query = _stringToQuery(toQueryStr);
      console.log("query: "+JSON.stringify(query));

      // Create the Firebase query
      var onQueryEvent = function(result) {
        console.log("onQueryEvent result: "+JSON.stringify(result));
        if (!result.error) {
          if(result.type==="ChildAdded"){
            _childAddedCallback(result.key, result.value);
          } else if(result.type==="ChildRemoved"){
            _childRemovedCallback(result.key, result.value);
          } else if(result.type==="ChildChanged"){
            _childChangedCallback(result.key, result.value);
          }
        }
      };

      firebase.query(
          onQueryEvent,
          firebaseDst,
          {
              // default false, so it listens continuously.
              singleEvent: false,
              orderBy: {
                  type: firebase.QueryOrderByType.CHILD,
                  value: "g" // mandatory when type is 'child'
              },
              ranges: [
                {
                    type: firebase.QueryRangeType.START_AT,
                    value: query[0]
                },
                {
                    type: firebase.QueryRangeType.END_AT,
                    value: query[1]
                }
              ]
          }
      ).then(function(result) {
        console.log("query result: "+JSON.stringify(result));
				// Add the geohash query to the current geohashes queried dictionary and save its state
        console.log("toQueryStr: "+JSON.stringify(toQueryStr));
        _currentGeohashesQueried[toQueryStr] = {
          active: true,
          path: result.path,
          listeners: result.listeners
        };
        console.log("_currentGeohashesQueried: "+JSON.stringify(_currentGeohashesQueried));
			}).catch(function(err) {
				console.log(err);
        throw new Error(err);
			});

      
    });
    
  }

  /********************/
  /*  PUBLIC METHODS  */
  /********************/
  /**
   * Returns the location signifying the center of this query.
   *
   * @return {Array.<number>} The [latitude, longitude] pair signifying the center of this query.
   */
  this.center = function() {
    return _center;
  };

  /**
   * Returns the radius of this query, in kilometers.
   *
   * @return {number} The radius of this query, in kilometers.
   */
  this.radius = function() {
    return _radius;
  };

  /**
   * OK
   * Updates the criteria for this query.
   *
   * @param {Object} newQueryCriteria The criteria which specifies the query's center and radius.
   */
  this.updateCriteria = function(newQueryCriteria) {
    // Validate and save the new query criteria
    validateCriteria(newQueryCriteria);
    _center = newQueryCriteria.center || _center;
    _radius = newQueryCriteria.radius || _radius;

    // Loop through all of the locations in the query, update their distance from the center of the
    // query, and fire any appropriate events
    console.log("_locationsTracked: "+JSON.stringify(_locationsTracked));
    var keys = Object.keys(_locationsTracked);
    console.log("keys: "+JSON.stringify(keys));
    var numKeys = keys.length;
    for (var i = 0; i < numKeys; ++i) {
      var key = keys[i];

      // Get the cached information for this location
      var locationDict = _locationsTracked[key];

      // Save if the location was already in the query
      var wasAlreadyInQuery = locationDict.isInQuery;

      // Update the location's distance to the new query center
      locationDict.distanceFromCenter = GeoFire.distance(locationDict.location, _center);

      // Determine if the location is now in this query
      locationDict.isInQuery = (locationDict.distanceFromCenter <= _radius);

      // If the location just left the query, fire the "key_exited" callbacks
      if (wasAlreadyInQuery && !locationDict.isInQuery) {
        _fireCallbacksForKey("key_exited", key, locationDict.location, locationDict.distanceFromCenter);
      }

      // If the location just entered the query, fire the "key_entered" callbacks
      else if (!wasAlreadyInQuery && locationDict.isInQuery) {
        _fireCallbacksForKey("key_entered", key, locationDict.location, locationDict.distanceFromCenter);
      }
    }


    // Listen for new geohashes being added to GeoFire and fire the appropriate events
    _listenForNewGeohashes();
  };

  /**
   * Attaches a callback to this query which will be run when the provided eventType fires. Valid eventType
   * values are "ready", "key_entered", "key_exited", and "key_moved". The ready event callback is passed no
   * parameters. All other callbacks will be passed three parameters: (1) the location's key, (2) the location's
   * [latitude, longitude] pair, and (3) the distance, in kilometers, from the location to this query's center
   *
   * "ready" is used to signify that this query has loaded its initial state and is up-to-date with its corresponding
   * GeoFire instance. "ready" fires when this query has loaded all of the initial data from GeoFire and fired all
   * other events for that data. It also fires every time updateQuery() is called, after all other events have
   * fired for the updated query.
   *
   * "key_entered" fires when a key enters this query. This can happen when a key moves from a location outside of
   * this query to one inside of it or when a key is written to GeoFire for the first time and it falls within
   * this query.
   *
   * "key_exited" fires when a key moves from a location inside of this query to one outside of it. If the key was
   * entirely removed from GeoFire, both the location and distance passed to the callback will be null.
   *
   * "key_moved" fires when a key which is already in this query moves to another location inside of it.
   *
   * Returns a GeoCallbackRegistration which can be used to cancel the callback. You can add as many callbacks
   * as you would like for the same eventType by repeatedly calling on(). Each one will get called when its
   * corresponding eventType fires. Each callback must be cancelled individually.
   *
   * @param {string} eventType The event type for which to attach the callback. One of "ready", "key_entered",
   * "key_exited", or "key_moved".
   * @callback callback Callback function to be called when an event of type eventType fires.
   * @return {GeoCallbackRegistration} A callback registration which can be used to cancel the provided callback.
   */
  this.on = function(eventType, callback) {
    // Validate the inputs
    if (["key_entered", "key_exited", "key_moved"].indexOf(eventType) === -1) {
      throw new Error("event type must be \"key_entered\", \"key_exited\", or \"key_moved\"");
    }
    if (typeof callback !== "function") {
      throw new Error("callback must be a function");
    }

    // Add the callback to this query's callbacks list
    _callbacks[eventType].push(callback);

    // If this is a "key_entered" callback, fire it for every location already within this query
    if (eventType === "key_entered") {
      var keys = Object.keys(_locationsTracked);
      var numKeys = keys.length;
      for (var i = 0; i < numKeys; ++i) {
        var key = keys[i];
        var locationDict = _locationsTracked[key];
        if (typeof locationDict !== "undefined" && locationDict.isInQuery) {
          callback(key, locationDict.location, locationDict.distanceFromCenter);
        }
      }
    }

    
    // Return an event registration which can be used to cancel the callback
    return new GeoCallbackRegistration(function() {
      _callbacks[eventType].splice(_callbacks[eventType].indexOf(callback), 1);
    });
  };

  /**
   * TODO
   * Terminates this query so that it no longer sends location updates. All callbacks attached to this
   * query via on() will be cancelled. This query can no longer be used in the future.
   */
  /*
  this.cancel = function () {
    // Cancel all callbacks in this query's callback list
    _callbacks = {
      key_entered: [],
      key_exited: [],
      key_moved: []
    };

    // Turn off all Firebase listeners for the current geohashes being queried
    var keys = Object.keys(_currentGeohashesQueried);
    var numKeys = keys.length;
    for (var i = 0; i < numKeys; ++i) {
      var geohashQueryStr = keys[i];
      var query = _stringToQuery(geohashQueryStr);
      _cancelGeohashQuery(query, _currentGeohashesQueried[geohashQueryStr]);
      delete _currentGeohashesQueried[geohashQueryStr];
    }

    // Delete any stored locations
    _locationsTracked = {};

    // Turn off the current geohashes queried clean up interval
    clearInterval(_cleanUpCurrentGeohashesQueriedInterval);
  };
*/

  /*****************/
  /*  CONSTRUCTOR  */
  /*****************/
  // Firebase reference of the GeoFire which created this query
  if (typeof firebaseDst !== "string") {
    throw new Error("firebaseDst must be a string");
  }
  

  // Event callbacks
  var _callbacks = {
    key_entered: [],
    key_exited: [],
    key_moved: []
  };


  // A dictionary of locations that are currently active in the queries
  // Note that not all of these are currently within this query
  var _locationsTracked = {};

  // A dictionary of geohash queries which currently have an active callbacks
  var _currentGeohashesQueried = {};

  // Every ten seconds, clean up the geohashes we are currently querying for. We keep these around
  // for a little while since it's likely that they will need to be re-queried shortly after they
  // move outside of the query's bounding box.
  var _geohashCleanupScheduled = false;
  var _cleanUpCurrentGeohashesQueriedTimeout = null;
  var _cleanUpCurrentGeohashesQueriedInterval = setInterval(function() {
      if (_geohashCleanupScheduled === false) {
        _cleanUpCurrentGeohashesQueried();
      }
    }, 10000);

  // Validate and save the query criteria
  validateCriteria(queryCriteria, /* requireCenterAndRadius */ true);
  var _center = queryCriteria.center;
  var _radius = queryCriteria.radius;

  // Listen for new geohashes being added around this query and fire the appropriate events
  _listenForNewGeohashes();
};
