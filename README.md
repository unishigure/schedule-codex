# schedule-codex

Create linux user

```shell
sudo useradd -m schedule_codex -s /bin/bash -G sudo docker
sudo passwd schedule_codex
sudo su - schedule_codex
```

Clone repository

```shell
git clone https://github.com/unishigure/schedule-codex
```

Edit .env

```shell
cd schedule-codex
cp .env.example .env
nano .env
```

Startup docker container

- API server
- cron job

```shell
docker compose -f docker/compose.yml --env-file .env up -d
```

Authenticate

```shell
curl --request GET --url http://localhost:3000/auth
```

```shell
curl --request GET --url http://localhost:3000/oauth2callback?code=<generated_code>
```

Get events and posting webhook

```shell
curl --request GET --url http://localhost:3000/week
curl --request POST --url http://localhost:3000/week
```
