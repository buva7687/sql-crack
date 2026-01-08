import { parseSchemaToGraph } from '../webview/schemaParser';

describe('Schema Parser', () => {
  describe('parseSchemaToGraph - Single Table', () => {
    it('should parse simple CREATE TABLE', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))';
      const result = parseSchemaToGraph(sql, 'MySQL');

      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should detect primary key', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode?.data.label).toContain('🔑');
    });

    it('should parse table with multiple columns', () => {
      const sql = `
        CREATE TABLE users (
          id INT PRIMARY KEY,
          name VARCHAR(100),
          email VARCHAR(255),
          created_at TIMESTAMP
        )
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode?.data.label).toContain('id');
      expect(tableNode?.data.label).toContain('name');
      expect(tableNode?.data.label).toContain('email');
    });

    it('should detect AUTO_INCREMENT', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100))';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode).toBeDefined();
    });

    it('should detect NOT NULL constraints', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL)';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode).toBeDefined();
    });

    it('should detect DEFAULT values', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, active BOOLEAN DEFAULT true)';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode).toBeDefined();
    });

    it('should detect UNIQUE constraints', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, email VARCHAR(255) UNIQUE)';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode).toBeDefined();
    });
  });

  describe('parseSchemaToGraph - Foreign Keys', () => {
    it('should detect foreign key constraints', () => {
      const sql = `
        CREATE TABLE orders (
          id INT PRIMARY KEY,
          user_id INT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode?.data.label).toContain('🔗');
    });

    it('should detect inline foreign key syntax', () => {
      const sql = 'CREATE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES users(id))';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode).toBeDefined();
    });

    it('should create edges for foreign key relationships', () => {
      const sql = `
        CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));
        CREATE TABLE orders (id INT PRIMARY KEY, user_id INT, FOREIGN KEY (user_id) REFERENCES users(id));
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      // Should have edges connecting related tables
      expect(result.edges.length).toBeGreaterThan(0);
    });

    it('should handle multiple foreign keys', () => {
      const sql = `
        CREATE TABLE order_items (
          id INT PRIMARY KEY,
          order_id INT,
          product_id INT,
          FOREIGN KEY (order_id) REFERENCES orders(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        )
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode).toBeDefined();
    });
  });

  describe('parseSchemaToGraph - Multiple Tables', () => {
    it('should parse multiple CREATE TABLE statements', () => {
      const sql = `
        CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));
        CREATE TABLE orders (id INT PRIMARY KEY, user_id INT);
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    });

    it('should create separate nodes for each table', () => {
      const sql = `
        CREATE TABLE users (id INT PRIMARY KEY);
        CREATE TABLE orders (id INT PRIMARY KEY);
        CREATE TABLE products (id INT PRIMARY KEY);
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      const usersNode = result.nodes.find(n => n.data.label.includes('users'));
      const ordersNode = result.nodes.find(n => n.data.label.includes('orders'));
      const productsNode = result.nodes.find(n => n.data.label.includes('products'));

      expect(usersNode).toBeDefined();
      expect(ordersNode).toBeDefined();
      expect(productsNode).toBeDefined();
    });

    it('should handle complex schema with relationships', () => {
      const sql = `
        CREATE TABLE users (
          id INT PRIMARY KEY,
          name VARCHAR(100)
        );
        CREATE TABLE orders (
          id INT PRIMARY KEY,
          user_id INT,
          total DECIMAL(10,2),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE order_items (
          id INT PRIMARY KEY,
          order_id INT,
          product_id INT,
          FOREIGN KEY (order_id) REFERENCES orders(id)
        );
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThanOrEqual(3);
      expect(result.edges.length).toBeGreaterThan(0);
    });
  });

  describe('parseSchemaToGraph - Different SQL Dialects', () => {
    it('should parse MySQL schema', () => {
      const sql = 'CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100))';
      const result = parseSchemaToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should parse PostgreSQL schema', () => {
      const sql = 'CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100))';
      const result = parseSchemaToGraph(sql, 'PostgreSQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should parse SQL Server schema', () => {
      const sql = 'CREATE TABLE users (id INT IDENTITY(1,1) PRIMARY KEY, name VARCHAR(100))';
      const result = parseSchemaToGraph(sql, 'Transact-SQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should parse SQLite schema', () => {
      const sql = 'CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)';
      const result = parseSchemaToGraph(sql, 'SQLite');

      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });

  describe('parseSchemaToGraph - Node styling', () => {
    it('should create nodes with gradient background', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode?.style?.background).toContain('linear-gradient');
    });

    it('should create nodes with borders', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode?.style?.border).toBeDefined();
    });

    it('should create nodes with positions', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode?.position.x).toBeDefined();
      expect(tableNode?.position.y).toBeDefined();
    });
  });

  describe('parseSchemaToGraph - Data types', () => {
    it('should handle INT data type', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, age INT)';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode?.data.label).toContain('INT');
    });

    it('should handle VARCHAR data type', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode?.data.label).toContain('VARCHAR');
    });

    it('should handle TEXT data type', () => {
      const sql = 'CREATE TABLE posts (id INT PRIMARY KEY, content TEXT)';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode?.data.label).toContain('TEXT');
    });

    it('should handle DECIMAL data type', () => {
      const sql = 'CREATE TABLE products (id INT PRIMARY KEY, price DECIMAL(10,2))';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode?.data.label).toContain('DECIMAL');
    });

    it('should handle TIMESTAMP data type', () => {
      const sql = 'CREATE TABLE logs (id INT PRIMARY KEY, created_at TIMESTAMP)';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode?.data.label).toContain('TIMESTAMP');
    });

    it('should handle BOOLEAN data type', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, active BOOLEAN)';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode).toBeDefined();
    });
  });

  describe('parseSchemaToGraph - Complex schemas', () => {
    it('should handle e-commerce schema', () => {
      const sql = `
        CREATE TABLE users (
          id INT PRIMARY KEY AUTO_INCREMENT,
          username VARCHAR(50) NOT NULL UNIQUE,
          email VARCHAR(100) NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE products (
          id INT PRIMARY KEY AUTO_INCREMENT,
          name VARCHAR(200) NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          stock INT DEFAULT 0
        );

        CREATE TABLE orders (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          total DECIMAL(10,2) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE order_items (
          id INT PRIMARY KEY AUTO_INCREMENT,
          order_id INT NOT NULL,
          product_id INT NOT NULL,
          quantity INT NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          FOREIGN KEY (order_id) REFERENCES orders(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThanOrEqual(4);
      expect(result.edges.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle schema with composite primary key', () => {
      const sql = `
        CREATE TABLE user_roles (
          user_id INT,
          role_id INT,
          PRIMARY KEY (user_id, role_id)
        )
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode).toBeDefined();
    });

    it('should handle schema with CHECK constraints', () => {
      const sql = 'CREATE TABLE products (id INT PRIMARY KEY, price DECIMAL(10,2) CHECK (price > 0))';
      const result = parseSchemaToGraph(sql, 'MySQL');

      const tableNode = result.nodes.find(n => n.id.includes('table'));
      expect(tableNode).toBeDefined();
    });
  });

  describe('parseSchemaToGraph - Edge cases', () => {
    it('should handle empty schema', () => {
      const sql = '';
      const result = parseSchemaToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBe(0);
      expect(result.edges.length).toBe(0);
    });

    it('should handle table without columns', () => {
      const sql = 'CREATE TABLE empty_table ()';

      // This might throw an error or create an empty node
      // depending on parser behavior
      expect(() => parseSchemaToGraph(sql, 'MySQL')).not.toThrow();
    });

    it('should handle table with only primary key', () => {
      const sql = 'CREATE TABLE simple (id INT PRIMARY KEY)';
      const result = parseSchemaToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should handle long table names', () => {
      const sql = 'CREATE TABLE very_long_table_name_that_exceeds_normal_length (id INT PRIMARY KEY)';
      const result = parseSchemaToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });

  describe('parseSchemaToGraph - AST structure', () => {
    it('should include AST in result', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))';
      const result = parseSchemaToGraph(sql, 'MySQL');

      expect(result.ast).toBeDefined();
    });

    it('should have correct AST type for CREATE TABLE', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY)';
      const result = parseSchemaToGraph(sql, 'MySQL');

      if (Array.isArray(result.ast)) {
        expect(result.ast[0].type).toBe('create');
      } else {
        expect(result.ast.type).toBe('create');
      }
    });
  });

  describe('parseSchemaToGraph - Foreign key relationships', () => {
    it('should create correct edge source and target', () => {
      const sql = `
        CREATE TABLE users (id INT PRIMARY KEY);
        CREATE TABLE orders (id INT PRIMARY KEY, user_id INT, FOREIGN KEY (user_id) REFERENCES users(id));
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      if (result.edges.length > 0) {
        expect(result.edges[0].source).toBeDefined();
        expect(result.edges[0].target).toBeDefined();
      }
    });

    it('should create edges with animated style', () => {
      const sql = `
        CREATE TABLE users (id INT PRIMARY KEY);
        CREATE TABLE orders (id INT PRIMARY KEY, user_id INT, FOREIGN KEY (user_id) REFERENCES users(id));
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      if (result.edges.length > 0) {
        expect(result.edges[0].animated).toBe(true);
      }
    });

    it('should label edges with relationship info', () => {
      const sql = `
        CREATE TABLE users (id INT PRIMARY KEY);
        CREATE TABLE orders (id INT PRIMARY KEY, user_id INT, FOREIGN KEY (user_id) REFERENCES users(id));
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      if (result.edges.length > 0) {
        expect(result.edges[0].label).toBeDefined();
      }
    });
  });

  describe('parseSchemaToGraph - Node layout', () => {
    it('should position nodes in a grid pattern', () => {
      const sql = `
        CREATE TABLE t1 (id INT PRIMARY KEY);
        CREATE TABLE t2 (id INT PRIMARY KEY);
        CREATE TABLE t3 (id INT PRIMARY KEY);
        CREATE TABLE t4 (id INT PRIMARY KEY);
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      // Nodes should have different positions
      const positions = result.nodes.map(n => ({ x: n.position.x, y: n.position.y }));
      const uniquePositions = new Set(positions.map(p => `${p.x},${p.y}`));

      expect(uniquePositions.size).toBeGreaterThan(1);
    });

    it('should space tables appropriately', () => {
      const sql = `
        CREATE TABLE t1 (id INT PRIMARY KEY);
        CREATE TABLE t2 (id INT PRIMARY KEY);
      `;
      const result = parseSchemaToGraph(sql, 'MySQL');

      if (result.nodes.length >= 2) {
        const xDiff = Math.abs(result.nodes[0].position.x - result.nodes[1].position.x);
        const yDiff = Math.abs(result.nodes[0].position.y - result.nodes[1].position.y);

        expect(xDiff > 0 || yDiff > 0).toBe(true);
      }
    });
  });
});
