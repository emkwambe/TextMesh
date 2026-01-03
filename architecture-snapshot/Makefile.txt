# =================================
# TEXTMESH MAKEFILE
# Convenience commands for development and deployment
# =================================

.PHONY: help install build dev test lint clean docker-build docker-up docker-down docker-logs docker-clean db-migrate db-seed k8s-deploy k8s-delete

# Default target
help:
	@echo "TextMesh - Available Commands"
	@echo ""
	@echo "Development:"
	@echo "  make install       - Install all dependencies"
	@echo "  make build         - Build all packages and services"
	@echo "  make dev           - Start development environment"
	@echo "  make test          - Run all tests"
	@echo "  make lint          - Run linter"
	@echo "  make clean         - Clean build artifacts"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build  - Build Docker images"
	@echo "  make docker-up     - Start all containers"
	@echo "  make docker-down   - Stop all containers"
	@echo "  make docker-logs   - View container logs"
	@echo "  make docker-clean  - Remove containers and volumes"
	@echo "  make docker-dev    - Start development environment with Docker"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate    - Run database migrations"
	@echo "  make db-seed       - Seed database with test data"
	@echo "  make db-reset      - Reset database (caution!)"
	@echo "  make db-studio     - Open Prisma Studio"
	@echo ""
	@echo "Kubernetes:"
	@echo "  make k8s-deploy    - Deploy to Kubernetes"
	@echo "  make k8s-delete    - Delete Kubernetes resources"
	@echo "  make k8s-logs      - View Kubernetes logs"
	@echo ""
	@echo "Production:"
	@echo "  make prod-build    - Build for production"
	@echo "  make prod-deploy   - Deploy to production"

# =================================
# DEVELOPMENT
# =================================

install:
	pnpm install

build:
	pnpm run build

dev:
	pnpm run dev

test:
	pnpm run test

lint:
	pnpm run lint

clean:
	find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
	find . -name "dist" -type d -prune -exec rm -rf '{}' +
	find . -name ".turbo" -type d -prune -exec rm -rf '{}' +
	find . -name "*.tsbuildinfo" -delete

# =================================
# DOCKER
# =================================

docker-build:
	docker-compose build

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

docker-clean:
	docker-compose down -v --rmi all --remove-orphans

docker-dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

docker-dev-build:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml build

docker-infra:
	docker-compose up -d postgres redis kafka zookeeper elasticsearch

docker-restart:
	docker-compose restart

docker-ps:
	docker-compose ps

# =================================
# DATABASE
# =================================

db-migrate:
	cd packages/db-client && pnpm prisma migrate deploy

db-migrate-dev:
	cd packages/db-client && pnpm prisma migrate dev

db-generate:
	cd packages/db-client && pnpm prisma generate

db-seed:
	cd packages/db-client && pnpm prisma db seed

db-reset:
	cd packages/db-client && pnpm prisma migrate reset

db-studio:
	cd packages/db-client && pnpm prisma studio

db-push:
	cd packages/db-client && pnpm prisma db push

# =================================
# KUBERNETES
# =================================

k8s-deploy:
	kubectl apply -f k8s/namespace.yaml
	kubectl apply -f k8s/configmaps/
	kubectl apply -f k8s/secrets/
	kubectl apply -f k8s/deployments/
	kubectl apply -f k8s/services/
	kubectl apply -f k8s/ingress/

k8s-delete:
	kubectl delete -f k8s/ --recursive --ignore-not-found

k8s-logs:
	kubectl logs -f -l app=textmesh --all-containers

k8s-status:
	kubectl get pods -l app=textmesh
	kubectl get svc -l app=textmesh

k8s-restart:
	kubectl rollout restart deployment -l app=textmesh

# =================================
# PRODUCTION
# =================================

prod-build:
	NODE_ENV=production pnpm run build
	docker-compose -f docker-compose.yml build

prod-deploy: prod-build
	docker-compose -f docker-compose.yml up -d

# =================================
# UTILITIES
# =================================

generate-ssl:
	mkdir -p nginx/ssl
	openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
		-keyout nginx/ssl/server.key \
		-out nginx/ssl/server.crt \
		-subj "/CN=localhost"

check-ports:
	@echo "Checking required ports..."
	@lsof -i :3000 || echo "Port 3000 available"
	@lsof -i :5432 || echo "Port 5432 available"
	@lsof -i :6379 || echo "Port 6379 available"
	@lsof -i :9092 || echo "Port 9092 available"
	@lsof -i :9200 || echo "Port 9200 available"

health-check:
	@echo "Checking service health..."
	@curl -sf http://localhost:3000/health || echo "API Gateway: DOWN"
	@curl -sf http://localhost:3001/health || echo "Auth Service: DOWN"
	@curl -sf http://localhost:3002/health || echo "User Service: DOWN"
	@curl -sf http://localhost:3003/health || echo "Post Service: DOWN"
	@curl -sf http://localhost:3004/health || echo "Feed Service: DOWN"
	@curl -sf http://localhost:3005/health || echo "Group Service: DOWN"
	@curl -sf http://localhost:3006/health || echo "Notification Service: DOWN"
	@curl -sf http://localhost:3007/health || echo "Moderation Service: DOWN"
	@curl -sf http://localhost:3008/health || echo "Search Service: DOWN"
