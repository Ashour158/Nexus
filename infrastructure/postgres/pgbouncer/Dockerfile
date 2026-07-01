FROM edoburu/pgbouncer:v1.24.1-p1

COPY pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
COPY userlist.txt /etc/pgbouncer/userlist.txt

USER postgres
EXPOSE 6432

ENTRYPOINT ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
