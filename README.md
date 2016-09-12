# API Reference | GeoFire for NativeScript

This is a customisation of [geofire-js](https://github.com/firebase/geofire-js), it has most of the functions of the original library.
To use this plugin you must have in your projet [nativescript-plugin-firebase](https://github.com/EddyVerbruggen/nativescript-plugin-firebase) installed.

## GeoFire

A `GeoFire` instance is used to read and write geolocation data to your Firebase database and to create queries.
This plugin uses `nativescript-plugin-firebase` to communicate with Firebase

### new GeoFire(firebase, firebaseDst)

Creates and returns a new `GeoFire` instance to manage your location data. Data will be stored at
the location pointed to by `firebaseDst`. Note that this `firebaseDst` can point to anywhere in your Firebase database.

```Typescript
import firebase = require("nativescript-plugin-firebase");
var GeoFire = require('geofire');

// Initialize Firebase
firebase.init({
  // ...
});

// Create a GeoFire index
var geoFire = new GeoFire(firebase, "/geohashes");
```

### GeoFire.dst()

Returns the Firebase destination used by GeoFire.

```Typescript

var dst = geoFire.dst();  // ref === /geohashes
```

### GeoFire.get(key)

Fetches the location stored for `key`.

Returns a promise fulfilled with the `location` corresponding to the provided `key`.
If `key` does not exist, the returned promise is fulfilled with `null`.

```JavaScript
geoFire.get("some_key").then(function(location) {
  if (location === null) {
    console.log("Provided key is not in GeoFire");
  }
  else {
    console.log("Provided key has a location of " + JSON.stringify(location));
  }
}, function(error) {
  console.log("Error: " + error);
});
```

### GeoFire.set(keyOrLocations[, location])

Adds the specified key - location pair(s) to this `GeoFire`. If the provided `keyOrLocations`
argument is a string, the single `location` will be added. The `keyOrLocations` argument can also
be an object containing a mapping between keys and locations allowing you to add several locations
to GeoFire in one write. It is much more efficient to add several locations at once than to write
each one individually.

If any of the provided keys already exist in this `GeoFire`, they will be overwritten with the new
location values. Locations must have the form `[latitude, longitude]`.

Returns a promise which is fulfilled when the new location has been synchronized with the Firebase
servers.

Keys must be strings and [valid Firebase database key
names](https://firebase.google.com/docs/database/web/structure-data).

```JavaScript
geoFire.set("some_key", [37.79, -122.41]).then(function() {
  console.log("Provided key has been added to GeoFire");
}, function(error) {
  console.log("Error: " + error);
});
```

```JavaScript
geoFire.set({
  "some_key": [37.79, -122.41],
  "another_key": [36.98, -122.56]
}).then(function() {
  console.log("Provided keys have been added to GeoFire");
}, function(error) {
  console.log("Error: " + error);
});
```

### GeoFire.remove(key)

Removes the provided `key` from this `GeoFire`. Returns a promise fulfilled when
the removal of `key` has been synchronized with the Firebase servers. If the provided
`key` is not present in this `GeoFire`, the promise will still successfully resolve.

This is equivalent to calling `set(key, null)` or `set({ <key>: null })`.

```JavaScript
geoFire.remove("some_key").then(function() {
  console.log("Provided key has been removed from GeoFire");
}, function(error) {
  console.log("Error: " + error);
});
```

### GeoFire.query(queryCriteria)

Creates and returns a new `GeoQuery` instance with the provided `queryCriteria`.

The `queryCriteria` describe a circular query and must be an object with the following keys:

* `center` - the center of this query, with the form `[latitude, longitude]`
* `radius` - the radius, in kilometers, from the center of this query in which to include results

```JavaScript
var geoQuery = geoFire.query({
  center: [10.38, 2.41],
  radius: 10.5
});
```

## GeoQuery

A standing query that tracks a set of keys matching a criteria. A new `GeoQuery` is created every time you call `GeoFire.query()`.

### GeoQuery.center()

Returns the `location` signifying the center of this query.

The returned `location` will have the form `[latitude, longitude]`.

```JavaScript
var geoQuery = geoFire.query({
  center: [10.38, 2.41],
  radius: 10.5
});

var center = geoQuery.center();  // center === [10.38, 2.41]
```

### GeoQuery.radius()

Returns the `radius` of this query, in kilometers.

```JavaScript
var geoQuery = geoFire.query({
  center: [10.38, 2.41],
  radius: 10.5
});

var radius = geoQuery.radius();  // radius === 10.5
```

### GeoQuery.updateCriteria(newQueryCriteria)

Updates the criteria for this query.

`newQueryCriteria` must be an object containing `center`, `radius`, or both.

```JavaScript
var geoQuery = geoFire.query({
  center: [10.38, 2.41],
  radius: 10.5
});

var center = geoQuery.center();  // center === [10.38, 2.41]
var radius = geoQuery.radius();  // radius === 10.5

geoQuery.updateCriteria({
  center: [-50.83, 100.19],
  radius: 5
});

center = geoQuery.center();  // center === [-50.83, 100.19]
radius = geoQuery.radius();  // radius === 5

geoQuery.updateCriteria({
  radius: 7
});

center = geoQuery.center();  // center === [-50.83, 100.19]
radius = geoQuery.radius();  // radius === 7
```

### GeoQuery.on(eventType, callback)

Attaches a `callback` to this query which will be run when the provided `eventType` fires. Valid `eventType` values are `key_entered`, `key_exited`, and `key_moved`. All `callbacks` will be passed three parameters:

1. the location's key
2. the location's [latitude, longitude] pair
3. the distance, in kilometers, from the location to this query's center

`key_entered` fires when a key enters this query. This can happen when a key moves from a location outside of this query to one inside of it or when a key is written to `GeoFire` for the first time and it falls within this query.

`key_exited` fires when a key moves from a location inside of this query to one outside of it. If the key was entirely removed from `GeoFire`, both the location and distance passed to the `callback` will be `null`.

`key_moved` fires when a key which is already in this query moves to another location inside of it.

Returns a `GeoCallbackRegistration` which can be used to cancel the `callback`. You can add as many callbacks as you would like for the same `eventType` by repeatedly calling `on()`. Each one will get called when its corresponding `eventType` fires. Each `callback` must be cancelled individually.

```JavaScript

var onKeyEnteredRegistration = geoQuery.on("key_entered", function(key, location, distance) {
  console.log(key + " entered query at " + location + " (" + distance + " km from center)");
});

var onKeyExitedRegistration = geoQuery.on("key_exited", function(key, location, distance) {
  console.log(key + " exited query to " + location + " (" + distance + " km from center)");
});

var onKeyMovedRegistration = geoQuery.on("key_moved", function(key, location, distance) {
  console.log(key + " moved within query to " + location + " (" + distance + " km from center)");
});
```


## Helper Methods

### GeoFire.distance(location1, location2)

Static helper method which returns the distance, in kilometers, between `location1` and `location2`.

`location1` and `location1` must have the form `[latitude, longitude]`.

```JavaScript
var location1 = [10.3, -55.3];
var location2 = [-78.3, 105.6];

var distance = GeoFire.distance(location1, location2);  // distance === 12378.536597423461
```


## Promises

GeoFire uses promises when writing and retrieving data. Promises represent the result of a potentially
long-running operation and allow code to run asynchronously. Upon completion of the operation, the
promise will be "resolved" / "fulfilled" with the operation's result. This result will be passed to
the function defined in the promise's `then()` method.

If you are unfamiliar with promises, check out [this blog post](http://www.html5rocks.com/en/tutorials/es6/promises/).
Here is a quick example of how to consume a promise:

```JavaScript
promise.then(function(result) {
  console.log("Promise was successfully resolved with the following value: " + result);
}, function(error) {
  console.log("Promise was rejected with the following error: " + error);
})
```