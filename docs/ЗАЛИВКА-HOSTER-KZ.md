# Заливка на сервер Hoster.kz (Cloud 1-1-25)

Сервер: `cloud-001.dialog-uchet.kz`, IP `185.100.66.120`, Ubuntu 22.04.
Почта `info@dialog-uchet.kz` остаётся на тарифе «Эконом-3». Его не отключаем, MX-записи не трогаем.

## Как устроено

```
GitHub (ветка main) ──каждые 2 мин──▶ сервер: git → npm ci → перезапуск → проверка главной
                                              └─ не открылась → откат на прежнюю версию
```

- Код лежит в `/srv/dialog-uchet/app`. Это копия репозитория GitHub, руками на сервере его не правим.
- Данные лежат в `/srv/dialog-uchet/data`: база, загруженные фото и видео, документы. Обновления их не трогают.
- Резервные копии:
  - база — раз в сутки, 14 копий: `data/backups`;
  - все данные — по воскресеньям, 8 архивов: `/srv/dialog-uchet/archive`.
- Ветка обновлений задаётся строкой `DEPLOY_BRANCH=` в `/etc/dialog-uchet.env`.

## Установка (один раз)

1. Доступ по ключу. Пароль root в переписку не попадает. Владелец доступа один раз выполняет в PowerShell команду ниже и вводит пароль сам. После этого установщик заходит по ключу.
   ```powershell
   type $env:USERPROFILE\.ssh\dialog_uchet.pub | ssh root@185.100.66.120 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
   ```
2. Установка:
   ```bash
   ssh -i ~/.ssh/dialog_uchet root@185.100.66.120 'curl -fsSL https://raw.githubusercontent.com/bevenergykz-design/Buhgalter/main/deploy/setup-vps.sh | bash'
   ```
   После установки сайт открывается по адресу `http://185.100.66.120`. Поисковики эту версию не индексируют.
3. Когда заказчик выберет дизайн:
   - выбранная ветка `design-N` переносится в `main`;
   - сервер сам подхватывает изменения;
   - проверка по IP.
4. Переключение домена в кабинете Hoster.kz:
   - в DNS dialog-uchet.kz A-записи `@` и `www` меняются на `185.100.66.120`;
   - MX и записи почты остаются как есть.
5. Через 15–60 минут, когда домен начнёт указывать на сервер, выпускается HTTPS:
   ```bash
   certbot --nginx --non-interactive --agree-tos --redirect -m info@dialog-uchet.kz -d dialog-uchet.kz -d www.dialog-uchet.kz
   ```
6. Панель управления: `https://dialog-uchet.kz/admin-181040019474`.
   - Первый вход — из `/srv/dialog-uchet/data/FIRST-ADMIN.txt`. Файл после этого удалить.
   - Затем заполнить «Уведомления»: e-mail для заявок и SMTP почты info@dialog-uchet.kz.

## Каждый день

Изменения вносятся в git и отправляются в `main` на GitHub. Через 2 минуты они на сайте.

| Задача | Команда (на сервере, от root) |
|---|---|
| Обновить сразу | `bash /srv/dialog-uchet/app/deploy/update.sh` |
| Журнал обновлений | `journalctl -u dialog-uchet-update -n 50 --no-pager` |
| Журнал сайта | `journalctl -u dialog-uchet -n 100 --no-pager` |
| Приостановить автообновление | `touch /srv/dialog-uchet/DEPLOY_PAUSED` (снять: `rm` этого файла) |
| Архив данных сейчас | `bash /srv/dialog-uchet/app/deploy/backup-data.sh` |
| Скачать архивы себе | `scp -i ~/.ssh/dialog_uchet -r root@185.100.66.120:/srv/dialog-uchet/archive ./backup-dialog` |

Если новая версия не запустилась, сервер сам вернёт прежнюю и больше не будет пробовать эту версию. Нужно исправить ошибку и отправить новый коммит.
