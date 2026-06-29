# API Design Guidelines

## RESTful Endpoints

All services expose RESTful endpoints following these conventions:

### URL Structure
```
GET    /{resource}          # List (paginated)
GET    /{resource}/:id      # Get one
POST   /{resource}          # Create
PATCH  /{resource}/:id      # Update
DELETE /{resource}/:id      # Delete
POST   /bulk/{resource}     # Batch operations
```

### Headers
```
Authorization: Bearer <jwt>
X-Tenant-ID: <tenant-id>
X-Request-ID: <uuid>
Content-Type: application/json
```

### Response Format
```json
{
  "data": {},
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

### Error Format
```json
{
  "error": "ValidationError",
  "message": "Request validation failed",
  "details": [
    { "path": "email", "message": "Invalid email format" }
  ],
  "requestId": "uuid"
}
```

## GraphQL

The GraphQL Gateway federates schemas from all services.

```graphql
query GetDeal($id: ID!) {
  deal(id: $id) {
    id
    name
    value
    contact {
      id
      email
    }
    owner {
      id
      name
    }
  }
}
```

## Rate Limits

- Authenticated: 1000 requests/minute
- Unauthenticated: 100 requests/minute
