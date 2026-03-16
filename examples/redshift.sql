DROP TABLE IF EXISTS #mytable;
CREATE TABLE #mytable
AS
SELECT
  a.amount_1 
  ,a.amount_2
  ,a.amount_5
  ,a.amount_6
  ,a.amount_7
  ,a.amount_8
  ,a.amount_9
FROM myschema.anothertable AS a
;

insert into myschema.targettable
select * FROM #mytable
WHERE amount_1 > 0
;


SELECT DISTINCT 
  mydate
INTO myschema.mytable
FROM (
SELECT current_date as mydate
  ) AS src;
select CURRENT_TIMESTAMP AT TIME ZONE 'Antarctica/South_Pole' AS report_date;
