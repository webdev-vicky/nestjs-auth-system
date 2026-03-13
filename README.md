# NestJS Authentication

![Workflow Test](https://github.com/anilahir/nestjs-authentication-and-authorization/actions/workflows/ci.yml/badge.svg)
![Prettier](https://img.shields.io/badge/Code%20style-prettier-informational?logo=prettier&logoColor=white)
[![GPL v3 License](https://img.shields.io/badge/License-GPLv3-green.svg)](./LICENSE)

## Description

NestJS Authentication without Passport using Bcrypt, JWT and Redis

## Features

1. Register
2. Login
3. Show profile
4. Logout

## Technologies Stack

- JWT
- Bcrypt
- TypeORM + MySQL
- Redis
- Docker
- Kubernetes (Minikube)
- MetalLB
- k6 (stress testing)

---

## Local Development Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Update `.env` with your local values:

```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=nest-jwt-authentication
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=password
REDIS_DATABASE=1
REDIS_KEY_PREFIX=nest-auth
JWT_SECRET=my_secret_key
JWT_ACCESS_TOKEN_TTL=3600
```

### 3. Start the application

```bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod
```

### Docker (development)

```bash
# start
npm run docker:up

# stop
npm run docker:down
```

---

## API Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/auth/sign-up` | No | Register a new user |
| POST | `/auth/sign-in` | No | Login and get access token |
| POST | `/auth/sign-out` | Yes | Logout and invalidate token |
| GET | `/users/me` | Yes | Get current user profile |
| GET | `/api` | No | Swagger documentation |

**Sign-up request body:**
```json
{
  "email": "user@example.com",
  "password": "Password1!",
  "passwordConfirm": "Password1!",
  "role": "user"
}
```

**Authenticated requests** — include header:
```
Authorization: Bearer <accessToken>
```

---

## Kubernetes Deployment

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Minikube](https://minikube.sigs.k8s.io/docs/start/) — `winget install Kubernetes.minikube`
- [kubectl](https://kubernetes.io/docs/tasks/tools/) — `winget install Kubernetes.kubectl`

### 1. Start Minikube

```bash
minikube start --driver=docker
```

### 2. Build the Docker image

> **Important:** Always build with `--target production` to ensure the correct CMD is included.

```bash
docker build --target production -t nestjs-auth-api:latest .
```

### 3. Load the image into Minikube

```bash
minikube image load nestjs-auth-api:latest
```

### 4. Apply Kubernetes secrets

```bash
kubectl apply -f nestjs-auth-secrets.yaml
```

The `nestjs-auth-secrets.yaml` creates a Secret with `DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET` and a ConfigMap for other DB config.

Or create the secret manually:

```bash
kubectl create secret generic nestjs-auth-secrets \
  --from-literal=DB_PASSWORD=password \
  --from-literal=REDIS_PASSWORD=password \
  --from-literal=JWT_SECRET=my_secret_key
```

### 5. Deploy MySQL and Redis

```bash
kubectl apply -f nestjs-auth-mysql.yaml
kubectl apply -f nestjs-auth-redis.yaml
```

### 6. Deploy the API

```bash
kubectl apply -f nestjs-auth-api.yaml
```

This creates:
- A `NodePort` Service on port `30001`
- A `Deployment` with 1 replica on the primary Minikube node
- Resource limits: CPU 100m–500m, Memory 128Mi–512Mi

### 7. Apply the LoadBalancer

```bash
kubectl apply -f nestjs-api-loadbalancer.yaml
```

Exposes the API on port `80` via a `LoadBalancer` service.

### 8. Access the API

Since Docker Desktop's internal network (`192.168.65.x`) is not directly reachable from Windows, use port-forward:

```bash
kubectl port-forward service/nestjs-api-loadbalancer 8080:80 --address 0.0.0.0
```

Then open: `http://localhost:8080` or `http://localhost:8080/api` (Swagger)

---

## Multi-node Setup (minikube-m02)

To distribute pods across a second Minikube node:

### 1. Add a second node

```bash
minikube node add
```

### 2. Install Flannel CNI (required for multi-node networking)

```bash
kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
```

### 3. Verify both nodes are Ready

```bash
kubectl get nodes
```

### 4. Load the image onto minikube-m02

```bash
minikube image load nestjs-auth-api:latest
```

### 5. Deploy 10 pods on minikube-m02

```bash
kubectl apply -f nestjs-api-m02-deployment.yaml
```

This deployment uses `nodeSelector: kubernetes.io/hostname: minikube-m02` to pin all 10 replicas to the second node. Both deployments share the `app: nestjs-api` label so the LoadBalancer routes traffic to all 12 pods.

---

## MetalLB Load Balancer

MetalLB enables `LoadBalancer` services in a bare-metal/local Kubernetes cluster.

### 1. Install MetalLB

```bash
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.9/config/manifests/metallb-native.yaml
```

Wait for the controller to be ready:

```bash
kubectl wait --namespace metallb-system \
  --for=condition=ready pod \
  --selector=component=controller \
  --timeout=90s
```

### 2. Apply the IP address pool

```bash
kubectl apply -f metallb-config.yaml
```

The pool is configured for `192.168.65.100–192.168.65.150` (Docker Desktop's internal subnet matching the Minikube node IP).

> **Note:** On Docker Desktop, MetalLB IPs are not directly reachable from Windows. Use `kubectl port-forward` instead.

---

## Horizontal Pod Autoscaler (HPA)

The HPA automatically scales `nestjs-api-deployment` between 1 and 5 replicas based on resource usage.

### 1. Enable metrics-server

```bash
minikube addons enable metrics-server
```

### 2. Apply the HPA

```bash
kubectl apply -f nestjs-api-hpa.yaml
```

**Scale thresholds:**
- CPU utilization > 60% → scale up
- Memory utilization > 70% → scale up

### Check HPA status

```bash
kubectl get hpa
```

---

## Stress Testing with k6

### Install k6

```bash
winget install k6
```

### Start port-forward before testing

```bash
kubectl port-forward service/nestjs-api-loadbalancer 8080:80 --address 0.0.0.0
```

### Run the stress test

```bash
k6 run stress-test.js
```

**Load stages:**

| Stage | Duration | Virtual Users |
|-------|----------|---------------|
| Ramp up | 30s | 0 → 20 |
| Load | 1m | 20 → 50 |
| Peak | 1m | 50 → 100 |
| Ramp down | 30s | 100 → 0 |

**Thresholds:**
- 95th percentile response time < 2s
- Error rate < 10%

---

## Bug Fixes

| Area | Fix |
|------|-----|
| `User` entity | Added `default: 'user'` to `role` column — previously caused `ER_NO_DEFAULT_FOR_FIELD` on sign-up |
| `jwt.config.ts` | `JWT_ACCESS_TOKEN_TTL` now parsed with `parseInt()` — string `"3600"` was treated as 3600ms (3.6s) instead of 3600 seconds |
| `nestjs-auth-secrets.yaml` | Added `JWT_SECRET` key — was missing, causing `couldn't find key JWT_SECRET` pod errors |
| Docker image | Must build with `--target production` — building without target produces image with `CMD ["node"]` only, causing instant pod exit |
| Redis username | Changed `REDIS_USERNAME` from `rootredis` to `default` in deployment — Redis only has the `default` user |

---

## Useful kubectl Commands

```bash
# List all pods with node assignment
kubectl get pods -o wide

# Check pods on a specific node
kubectl get pods --field-selector spec.nodeName=minikube-m02

# View pod logs
kubectl logs <pod-name> -f

# Describe a pod (events, errors)
kubectl describe pod <pod-name>

# Restart a deployment
kubectl rollout restart deployment/<deployment-name>

# Scale a deployment
kubectl scale deployment nestjs-api-deployment --replicas=3

# Stop all nestjs-api pods permanently
kubectl scale deployment nestjs-api-deployment --replicas=0

# Check HPA status
kubectl get hpa

# Check all services
kubectl get services

# Update a secret
kubectl create secret generic nestjs-auth-secrets \
  --from-literal=DB_PASSWORD=password \
  --from-literal=REDIS_PASSWORD=password \
  --from-literal=JWT_SECRET=my_secret_key \
  --dry-run=client -o yaml | kubectl apply -f -

# Port-forward to access the app locally
kubectl port-forward service/nestjs-api-loadbalancer 8080:80 --address 0.0.0.0
```

---

## Kubernetes Files Reference

| File | Description |
|------|-------------|
| `nestjs-auth-api.yaml` | NodePort Service + primary API Deployment (1 replica, minikube node) |
| `nestjs-api-m02-deployment.yaml` | API Deployment (10 replicas, pinned to minikube-m02) |
| `nestjs-api-loadbalancer.yaml` | LoadBalancer Service (port 80 → 3000) |
| `nestjs-api-hpa.yaml` | HorizontalPodAutoscaler (1–5 replicas) |
| `nestjs-auth-secrets.yaml` | Secret (DB_PASSWORD, REDIS_PASSWORD, JWT_SECRET) + ConfigMap |
| `nestjs-auth-mysql.yaml` | MySQL Deployment + ClusterIP Service |
| `nestjs-auth-redis.yaml` | Redis Deployment + ClusterIP Service |
| `metallb-config.yaml` | MetalLB IPAddressPool + L2Advertisement |
| `stress-test.js` | k6 stress test script |

---

## Swagger Documentation

Available at `http://localhost:8080/api` when running locally via port-forward.

## References

- [NestJS Authentication without Passport](https://trilon.io/blog/nestjs-authentication-without-passport)
- [NestJS, Redis and Postgres local development with Docker Compose](https://www.tomray.dev/nestjs-docker-compose-postgres)
- [Minikube Documentation](https://minikube.sigs.k8s.io/docs/)
- [MetalLB Documentation](https://metallb.universe.tf/)
- [k6 Documentation](https://k6.io/docs/)

## Author

**Prakash Kumar Mandal**

- Github: [@prakash-mandal](https://github.com/bytecodepandit)
- LinkedIn: [@prakash-mandal](https://www.linkedin.com/in/prakash-mandal-5b25651bb/)

## Show your support

Give a star if this project helped you!

## License

Released under the terms of [MIT](./LICENSE)
