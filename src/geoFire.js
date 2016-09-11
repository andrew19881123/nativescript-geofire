/**
 * Creates a GeoFire instance.
 *
 * @constructor
 * @this {GeoFire}
 * @param {String} firebase from nativescript-plugin-firebase
 * @param {String} firebaseDst A path where the GeoFire data will be stored.
 */
var GeoFire = function(firebase, firebaseDst) {
  /********************/
  /*  PUBLIC METHODS  */
  /********************/
  /**
   * Returns the Firebase instance used to create this GeoFire instance.
   *
   * @return {Firebase} The Firebase instance used to create this GeoFire instance.
   */
  this.dst = function() {
    return firebaseDst;
  };

  /**
   * Adds the provided key - location pair(s) to Firebase. Returns an empty promise which is fulfilled when the write is complete.
   *
   * If any provided key already exists in this GeoFire, it will be overwritten with the new location value.
   *
   * @param {string|Object} keyOrLocations The key representing the location to add or a mapping of key - location pairs which
   * represent the locations to add.
   * @param {Array.<number>|undefined} location The [latitude, longitude] pair to add.
   * @return {Promise.<>} A promise that is fulfilled when the write is complete.
   */
  this.set = function(keyOrLocations, location) {
    var locations;
    if (typeof keyOrLocations === "string" && keyOrLocations.length !== 0) {
      // If this is a set for a single location, convert it into a object
      locations = {};
      locations[keyOrLocations] = location;
    } else if (typeof keyOrLocations === "object") {
      if (typeof location !== "undefined") {
        throw new Error("The location argument should not be used if you pass an object to set().");
      }
      locations = keyOrLocations;
    } else {
      throw new Error("keyOrLocations must be a string or a mapping of key - location pairs.");
    }

    var newData = {};

    Object.keys(locations).forEach(function(key) {
      validateKey(key);

      var location = locations[key];
      if (location === null) {
        // Setting location to null is valid since it will remove the key
        newData[key] = null;
      } else {
        validateLocation(location);

        var geohash = encodeGeohash(location);
        newData[key] = encodeGeoFireObject(location, geohash);
      }
    });

    return firebase.update(firebaseDst, newData);
  };

  /**
   * Returns a promise fulfilled with the location corresponding to the provided key.
   *
   * If the provided key does not exist, the returned promise is fulfilled with null.
   *
   * @param {string} key The key of the location to retrieve.
   * @return {void}
   */
  this.get = function(key) {
    validateKey(key);

    return firebase.query(
              function(){},
              firebaseDst,
              {
                  // Only when true this function will return the date in the promise as well!
                  singleEvent: true,
                  // order by company.country
                  orderBy: {
                      type: firebase.QueryOrderByType.CHILD,
                      value: "since" // mandatory when type is 'child'
                  },
                  range: {
                      type: firebase.QueryRangeType.EQUAL_TO,
                      value: key
                  },
                  // (note that there's only 1 in this case anyway)
                  limit: {
                      type: firebase.QueryLimitType.LAST,
                      value: 1
                  }
              }
      ).then(function(dataSnapshot) {
        var snapshotVal = dataSnapshot.val();
        if (snapshotVal === null) {
          return null;
        } else {
          return decodeGeoFireObject(snapshotVal);
        }
      });
  };

  /**
   * Removes the provided key from this GeoFire. Returns an empty promise fulfilled when the key has been removed.
   *
   * If the provided key is not in this GeoFire, the promise will still successfully resolve.
   *
   * @param {string} key The key of the location to remove.
   * @return {Promise.<string>} A promise that is fulfilled after the inputted key is removed.
   */
  this.remove = function(key) {
    return this.set(key, null);
  };

  /**
   * Returns a new GeoQuery instance with the provided queryCriteria.
   *
   * @param {Object} queryCriteria The criteria which specifies the GeoQuery's center and radius.
   * @return {GeoQuery} A new GeoQuery object.
   */
  this.query = function(queryCriteria) {
    return new GeoQuery(firebase, firebaseDst, queryCriteria);
  };

  /*****************/
  /*  CONSTRUCTOR  */
  /*****************/
  if (typeof firebaseDst !== "string") {
    throw new Error("firebaseDst must be a string");
  }
  //TODO check firebase

};


GeoFire.distance = function(location1, location2) {
  return calculateDistance(location1, location2);
};
