# Public REST API Automation Test Plan

## Application Overview

Automated functional and contract coverage for every unauthenticated public endpoint documented at https://restful-api.dev/: GET /objects, GET /objects/{id}, POST /objects, PUT /objects/{id}, PATCH /objects/{id}, and DELETE /objects/{id}. Runs against https://api.restful-api.dev without credentials. Authenticated collection/account endpoints are intentionally out of scope. The API documentation provides examples but does not specify exact status codes for every error; assert successful 2xx responses for documented valid requests and appropriate 4xx rejection for invalid or missing-resource cases without hard-coding an undocumented error payload/status. Each test starts from a fresh isolated test state and uses uniquely named resources with best-effort cleanup in teardown.

## Test Scenarios

### 1. Public object retrieval

**Seed:** `tests/seed.spec.ts`

#### 1.1. List predefined public objects

**File:** `tests/public-api/get-objects.spec.ts`

**Steps:**
  1. Send an unauthenticated HTTPS GET request to https://api.restful-api.dev/objects.
    - expect: The response is successful (2xx) and contains valid JSON.
    - expect: The response body is a non-empty array of objects; each entry has a string id, a string name, and a data property that is either an object or null.
    - expect: The documented sample objects are represented, including id 1 (Google Pixel 6 Pro) and id 7 (Apple MacBook Pro 16), without requiring the list to contain only those examples.

#### 1.2. Filter objects by one and repeated IDs

**File:** `tests/public-api/get-objects-by-id.spec.ts`

**Steps:**
  1. Send GET /objects?id=7 and then GET /objects?id=3&id=5&id=10 without authentication.
    - expect: Each response is successful (2xx) and valid JSON.
    - expect: The single-ID request returns only the object with id 7.
    - expect: The repeated-parameter request returns the requested IDs 3, 5, and 10 and excludes unrelated objects.

#### 1.3. Retrieve a documented existing object

**File:** `tests/public-api/get-object.spec.ts`

**Steps:**
  1. Send an unauthenticated GET request to /objects/7.
    - expect: The response is successful (2xx) and is a JSON object, not an array.
    - expect: The response has id "7", name "Apple MacBook Pro 16", and data containing year 2019, price 1849.99, CPU model "Intel Core i9", and hard disk size "1 TB".

#### 1.4. Reject retrieval of an unknown object ID

**File:** `tests/public-api/get-object-not-found.spec.ts`

**Steps:**
  1. Send GET /objects/{unknownId} using a unique ID confirmed not to exist in this test run.
    - expect: The API returns a client-error/not-found response (4xx), rather than a successful object or a server error.
    - expect: The error response is handled as an error response and does not contain a valid object claiming the requested ID.

#### 1.5. Return no objects for an unknown list filter

**File:** `tests/public-api/filter-unknown-id.spec.ts`

**Steps:**
  1. Send GET /objects?id={unknownId} with an ID known not to exist.
    - expect: The response is successful (2xx) with a valid JSON array containing no objects for the unknown ID.
    - expect: No unrelated seeded objects are returned.

### 2. Public object creation and validation

**Seed:** `tests/seed.spec.ts`

#### 2.1. Create an object with nested JSON data

**File:** `tests/public-api/create-object.spec.ts`

**Steps:**
  1. Generate a unique name and send POST /objects with Content-Type: application/json and a body containing that name plus nested object data with representative string, number, boolean, array, and nested-object values.
    - expect: The response is successful (2xx) and valid JSON.
    - expect: The response includes a non-empty string id, the submitted name and data, and a createdAt timestamp.
    - expect: GET /objects/{returnedId} retrieves the same persisted values.
    - expect: Delete the created object in a finally/teardown block, even if an assertion fails.

#### 2.2. Create an object with array-shaped custom data

**File:** `tests/public-api/create-array-data.spec.ts`

**Steps:**
  1. POST /objects with JSON Content-Type, a unique name, and data set to an array containing mixed JSON values.
    - expect: The request succeeds with a 2xx response and valid JSON.
    - expect: The response preserves the submitted array data and returns an id and createdAt timestamp.
    - expect: A subsequent GET by the returned ID returns the same data.
    - expect: Delete the created object during teardown.

#### 2.3. Reject malformed and incomplete create requests

**File:** `tests/public-api/create-invalid-body.spec.ts`

**Steps:**
  1. Send POST /objects with syntactically malformed JSON, then send requests missing the documented name field and missing the documented data field.
    - expect: Each invalid request is rejected with a 4xx response; no request produces an unhandled 5xx response.
    - expect: The malformed request does not create an object.
    - expect: The API does not return a success-shaped created-object response for an invalid request.

#### 2.4. Enforce JSON content type for object creation

**File:** `tests/public-api/create-content-type.spec.ts`

**Steps:**
  1. Send POST /objects with a valid JSON payload but omit Content-Type: application/json, then repeat with an unsupported Content-Type.
    - expect: Invalid or unsupported content types are rejected with a 4xx response or the documented request is otherwise not accepted as a successful object creation.
    - expect: No object is created for either rejected request.

### 3. Public object updates and deletion

**Seed:** `tests/seed.spec.ts`

#### 3.1. Replace an existing object with PUT

**File:** `tests/public-api/update-object.spec.ts`

**Steps:**
  1. Create a uniquely named fixture with at least two data fields, then PUT /objects/{id} with Content-Type: application/json and a complete replacement body containing a new name and a deliberately changed data object that omits one original key.
    - expect: The PUT response is successful (2xx), valid JSON, and identifies the same id with the submitted replacement name and data plus an updatedAt timestamp.
    - expect: GET by ID confirms replaced values and confirms omitted old data keys are no longer present.
    - expect: The created fixture is deleted in teardown.

#### 3.2. Do not create a missing object with PUT

**File:** `tests/public-api/update-object-not-found.spec.ts`

**Steps:**
  1. Send a valid PUT body to /objects/{unknownId} using an ID confirmed not to exist.
    - expect: The API rejects the request with a 4xx response and does not create an object at that ID.
    - expect: A subsequent GET for that ID remains not found.

#### 3.3. Partially update a single object field

**File:** `tests/public-api/patch-object.spec.ts`

**Steps:**
  1. Create a uniquely named fixture with known data, then PATCH /objects/{id} with Content-Type: application/json and a body containing only a new name.
    - expect: The PATCH response is successful (2xx), valid JSON, and contains the same id, the new name, unchanged data, and an updatedAt timestamp.
    - expect: GET by ID confirms fields omitted from the PATCH body remain unchanged.
    - expect: Delete the fixture during teardown.

#### 3.4. Do not create a missing object with PATCH

**File:** `tests/public-api/patch-object-not-found.spec.ts`

**Steps:**
  1. Send a valid PATCH body to /objects/{unknownId} using an ID confirmed not to exist.
    - expect: The API rejects the request with a 4xx response and does not create an object at that ID.
    - expect: A subsequent GET for that ID remains not found.

#### 3.5. Enforce JSON content type for PUT and PATCH

**File:** `tests/public-api/update-content-type.spec.ts`

**Steps:**
  1. For an existing uniquely created fixture, send otherwise-valid PUT and PATCH payloads with a missing or unsupported Content-Type header.
    - expect: Each invalid request is rejected or not applied; neither request is reported as a successful update.
    - expect: GET confirms the fixture is unchanged after each rejected request.
    - expect: Delete the fixture in teardown.

#### 3.6. Delete an existing object and verify removal

**File:** `tests/public-api/delete-object.spec.ts`

**Steps:**
  1. Create a uniquely named fixture, then send DELETE /objects/{id}.
    - expect: The delete response is successful (2xx) and valid JSON with a message identifying the deleted id, as shown in the documentation.
    - expect: A subsequent GET for the deleted id returns a 4xx not-found response.
    - expect: No unrelated seeded object is changed.

#### 3.7. Delete an unknown object ID safely

**File:** `tests/public-api/delete-object-not-found.spec.ts`

**Steps:**
  1. Send DELETE /objects/{unknownId} using an ID confirmed not to exist.
    - expect: The API returns a client error/not-found response (4xx), not a server error or a successful deletion of another resource.
    - expect: A subsequent GET for that ID remains not found.

### 4. Public API transport and browser access

**Seed:** `tests/seed.spec.ts`

#### 4.1. Serve public endpoints securely over HTTPS

**File:** `tests/public-api/https-json.spec.ts`

**Steps:**
  1. Call the public list and single-object read endpoints using the documented https://api.restful-api.dev base URL.
    - expect: Both requests complete over TLS without downgrading to plaintext HTTP.
    - expect: Both responses use valid JSON and satisfy their respective documented response shapes.

#### 4.2. Allow cross-origin access to public routes

**File:** `tests/public-api/cors.spec.ts`

**Steps:**
  1. From a browser context served on a different origin, issue a cross-origin GET to /objects and a preflight OPTIONS request for a JSON POST with Origin, Access-Control-Request-Method, and Access-Control-Request-Headers headers.
    - expect: The browser can read the GET response from the foreign origin, as the documentation claims CORS is enabled for all domains.
    - expect: The preflight response authorizes the requesting origin (or wildcard), the requested method, and the JSON content-type header.
    - expect: The browser does not block the allowed request due to CORS.
