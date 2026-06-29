FROM pgbouncer/pgbouncer:1.22.1

COPY pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
COPY userlist.txt /etc/pgbouncer/userlist.txt

USER pgbouncer
EXPOSE 6432

ENTRYPOINT ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
