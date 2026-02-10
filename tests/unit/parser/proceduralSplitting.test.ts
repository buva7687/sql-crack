/**
 * Item #4: Procedural SQL Splitting (BEGIN...END Blocks)
 * 
 * Tests for verifying that SQL statements are split correctly
 * even when they contain procedural code blocks (stored procedures, functions, triggers).
 */

import { splitSqlStatements } from '../../../src/webview/sqlParser';

describe('Item #4: Procedural SQL Splitting (BEGIN...END Blocks)', () => {
    describe('BEGIN...END Blocks', () => {
        it('should not split on semicolons inside BEGIN...END blocks', () => {
            const sql = `
                CREATE PROCEDURE test_proc()
                BEGIN
                    SELECT * FROM users;
                    INSERT INTO logs (message) VALUES ('test');
                    UPDATE counters SET count = count + 1;
                END;
                SELECT * FROM orders;
            `;
            const statements = splitSqlStatements(sql);

            // Should split into 2 statements: the CREATE PROCEDURE and the final SELECT
            // The semicolons inside BEGIN...END should not cause splits
            expect(statements.length).toBe(2);
            expect(statements[0]).toMatch(/CREATE PROCEDURE/);
            expect(statements[0]).toMatch(/BEGIN.*END/s); // Should contain entire BEGIN...END block
            expect(statements[1]).toMatch(/SELECT \* FROM orders/);
        });

        it('should handle nested BEGIN...END blocks', () => {
            const sql = `
                CREATE PROCEDURE nested_test()
                BEGIN
                    DECLARE x INT;
                    IF x > 0 THEN
                        BEGIN
                            SELECT * FROM users WHERE id = x;
                        END;
                    END IF;
                END;
            `;
            const statements = splitSqlStatements(sql);

            // Should be 1 statement with nested blocks intact
            expect(statements.length).toBe(1);
            expect(statements[0]).toMatch(/CREATE PROCEDURE/);
            expect(statements[0]).toMatch(/BEGIN.*END/s);
        });

        it('should handle BEGIN TRANSACTION (not a block)', () => {
            const sql = `
                BEGIN TRANSACTION;
                UPDATE accounts SET balance = balance - 100 WHERE id = 1;
                COMMIT;
                SELECT * FROM accounts;
            `;
            const statements = splitSqlStatements(sql);

            // BEGIN TRANSACTION is not a block, so should split normally
            expect(statements.length).toBe(4);
            expect(statements[0]).toMatch(/BEGIN TRANSACTION/);
            expect(statements[1]).toMatch(/UPDATE accounts/);
            expect(statements[2]).toMatch(/COMMIT/);
            expect(statements[3]).toMatch(/SELECT \* FROM accounts/);
        });

        it('should distinguish BEGIN in procedures vs transactions', () => {
            const sql = `
                CREATE PROCEDURE test()
                BEGIN
                    BEGIN TRANSACTION;
                    UPDATE users SET active = 1;
                    COMMIT;
                END;
                SELECT * FROM users;
            `;
            const statements = splitSqlStatements(sql);

            // Should be 2 statements (CREATE PROCEDURE + SELECT)
            // The inner BEGIN TRANSACTION should not split the procedure
            expect(statements.length).toBe(2);
        });
    });

    describe('PostgreSQL Dollar Quotes ($$)', () => {
        it('should not split on semicolons inside $$...$$ blocks', () => {
            const sql = `
                CREATE FUNCTION add(a INT, b INT) RETURNS INT AS $$
                BEGIN
                    RETURN a + b;
                END;
                $$ LANGUAGE plpgsql;
                SELECT * FROM users;
            `;
            const statements = splitSqlStatements(sql);

            // Should be 2 statements: CREATE FUNCTION and SELECT
            expect(statements.length).toBe(2);
            expect(statements[0]).toMatch(/CREATE FUNCTION/);
            expect(statements[0]).toMatch(/\$\$.*\$\$/s); // Should contain entire $$...$$ block
            expect(statements[1]).toMatch(/SELECT \* FROM users/);
        });

        it('should handle multiple $$ blocks in one statement', () => {
            const sql = `
                CREATE PROCEDURE test_proc()
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    -- First block
                    SELECT * FROM users;
                    
                    -- Second block inside
                    IF TRUE THEN
                        SELECT * FROM orders;
                    END IF;
                END;
                $$;
                SELECT * FROM products;
            `;
            const statements = splitSqlStatements(sql);

            // Should be 2 statements
            expect(statements.length).toBe(2);
        });

        it('should handle named dollar quote tags', () => {
            const sql = `
                CREATE FUNCTION test() RETURNS INT AS $function$
                BEGIN
                    RETURN 1;
                END;
                $function$ LANGUAGE plpgsql;
                SELECT * FROM users;
            `;
            const statements = splitSqlStatements(sql);

            // Should be 2 statements
            expect(statements.length).toBe(2);
            expect(statements[0]).toMatch(/CREATE FUNCTION/);
            expect(statements[0]).toMatch(/\$function\$.*\$function\$/s);
        });
    });

    describe('MySQL DELIMITER Statements', () => {
        it('should handle MySQL DELIMITER changes', () => {
            const sql = `
                DELIMITER ;;
                CREATE PROCEDURE test_proc()
                BEGIN
                    SELECT * FROM users;;
                    INSERT INTO logs VALUES ('test');;
                END;;
                DELIMITER ;
                SELECT * FROM orders;
            `;
            const statements = splitSqlStatements(sql);

            // Should respect DELIMITER changes
            // After DELIMITER ;;, statements end with ;;
            // After DELIMITER ;, statements end with ;
            expect(statements.length).toBeGreaterThanOrEqual(2);
        });

        it('should handle stored procedures with ;; delimiter', () => {
            const sql = `
                DELIMITER ;;
                CREATE PROCEDURE simple_proc()
                BEGIN
                    SELECT 'Hello';
                END;;
                DELIMITER ;
                SELECT * FROM users;
            `;
            const statements = splitSqlStatements(sql);

            // DELIMITER ;; means ;; is the statement terminator, not ;
            // Should be 2: CREATE PROCEDURE and SELECT
            expect(statements.length).toBe(2);
        });
    });

    describe('T-SQL BEGIN TRY...END TRY Blocks', () => {
        it('should handle BEGIN TRY...END TRY BEGIN CATCH...END CATCH', () => {
            const sql = `
                CREATE PROCEDURE test_proc()
                AS
                BEGIN
                    BEGIN TRY
                        SELECT * FROM users;
                    END TRY
                    BEGIN CATCH
                        SELECT ERROR_MESSAGE() AS error;
                    END CATCH
                END;
                SELECT * FROM orders;
            `;
            const statements = splitSqlStatements(sql);

            // Should be 2 statements
            expect(statements.length).toBe(2);
            expect(statements[0]).toMatch(/CREATE PROCEDURE/);
            expect(statements[0]).toMatch(/BEGIN TRY.*END CATCH/s);
        });

        it('should handle nested TRY...CATCH blocks', () => {
            const sql = `
                CREATE PROCEDURE nested_try()
                AS
                BEGIN
                    BEGIN TRY
                        BEGIN TRY
                            SELECT * FROM users;
                        END TRY
                        BEGIN CATCH
                            SELECT ERROR_MESSAGE();
                        END CATCH
                    END TRY
                    BEGIN CATCH
                        SELECT ERROR_MESSAGE();
                    END CATCH
                END;
            `;
            const statements = splitSqlStatements(sql);

            // Should be 1 statement with nested blocks intact
            expect(statements.length).toBe(1);
        });
    });

    describe('Complex Scenarios', () => {
        it('should handle migration file with multiple procedures', () => {
            const sql = `
                CREATE PROCEDURE proc1()
                BEGIN
                    SELECT 1;
                END;
                
                CREATE PROCEDURE proc2()
                BEGIN
                    SELECT 2;
                END;
                
                CREATE TABLE test (id INT);
            `;
            const statements = splitSqlStatements(sql);

            // Should be 3 statements: 2 procedures + 1 CREATE TABLE
            expect(statements.length).toBe(3);
        });

        it('should handle CASE...END inside procedures', () => {
            const sql = `
                CREATE FUNCTION test_func(x INT) RETURNS INT
                BEGIN
                    RETURN CASE 
                        WHEN x > 0 THEN 1
                        WHEN x < 0 THEN -1
                        ELSE 0
                    END;
                END;
                SELECT * FROM users;
            `;
            const statements = splitSqlStatements(sql);

            // CASE...END should not affect splitting
            // It's inside BEGIN...END so should be part of the function
            expect(statements.length).toBe(2);
        });

        it('should handle IF...END blocks', () => {
            const sql = `
                CREATE PROCEDURE if_test()
                BEGIN
                    IF TRUE THEN
                        SELECT * FROM users;
                    ELSE
                        SELECT * FROM orders;
                    END IF;
                END;
            `;
            const statements = splitSqlStatements(sql);

            // IF...END IF should be part of the BEGIN...END block
            expect(statements.length).toBe(1);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty BEGIN...END blocks', () => {
            const sql = `
                CREATE PROCEDURE empty()
                BEGIN
                END;
                SELECT 1;
            `;
            const statements = splitSqlStatements(sql);

            expect(statements.length).toBe(2);
        });

        it('should handle BEGIN...END with only comments', () => {
            const sql = `
                CREATE PROCEDURE comments_only()
                BEGIN
                    -- This is a comment
                    /* Multi-line
                       comment */
                END;
                SELECT 1;
            `;
            const statements = splitSqlStatements(sql);

            expect(statements.length).toBe(2);
        });

        it('should handle semicolons in string literals inside blocks', () => {
            const sql = `
                CREATE PROCEDURE string_test()
                BEGIN
                    SELECT 'Hello; World; Test';
                END;
                SELECT 1;
            `;
            const statements = splitSqlStatements(sql);

            // Semicolons inside strings should not split
            expect(statements.length).toBe(2);
        });
    });
});
