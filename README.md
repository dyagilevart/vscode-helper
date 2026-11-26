# Lumos

Неофициальный помощник разработчика в духе «зажечь свет» над текущей задачей.

Карточка задачи из Naumen Project Ruler определяется по git-ветке (`feature/ACRM-123…`).

## Настройка

1. Settings → `lumos.baseUrl` — например `https://project-ruler.example.com` (без `/sd`).
2. Command Palette → **Lumos: Войти**.
3. Откройте сайдбар **Lumos** → **Свиток задачи**.

В status bar появится `✨ ACRM-…` — клик открывает свиток.

## Команды

- `Lumos: Войти` / `Lumos: Выйти`
- `Lumos: Зажечь свет` — обновить карточку
- `Lumos: Открыть свиток`

## Локальный mock Project Ruler

Без рабочего VPN можно поднять имитацию API:

```bash
npm run mock:naumen
```

В settings: `lumos.baseUrl` = `http://127.0.0.1:8787`  
Sign In: любой логин/пароль **или** Access Key `test`  
Ветка: `feature/ACRM-234123` (сабтаск) или `feature/ACRM-100001` (мастер → предупреждение)

Если тип задачи не `SUB-TASK`, карточка и status bar активно мигают.

Проверка API:

```bash
npm run smoke:mock
```
