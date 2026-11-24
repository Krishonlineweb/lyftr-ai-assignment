.PHONY: up down build logs test clean

# Start both backend and frontend containers
up:
	docker compose up -d --build

# Stop and remove containers and networks
down:
	docker compose down

# Build container images without starting
build:
	docker compose build

# View logs from all services
logs:
	docker compose logs -f

# Run backend unit and integration tests
test:
	docker compose run --rm backend pytest -v /app/tests

# Clean up containers, networks and volumes
clean:
	docker compose down -v
