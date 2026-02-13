/**
 * Safe formula evaluator that supports basic math expressions
 * Replaces eval() with a safe expression parser
 */
export class FormulaEvaluator {
  /**
   * Evaluate a formula with the given context
   * @param {string} formula - The formula to evaluate
   * @param {Object} context - Variables to substitute
   * @returns {number}
   */
  static evaluate(formula, context = {}) {
    try {
      // Replace context variables with their values
      let expression = formula;
      for (const [key, value] of Object.entries(context)) {
        // Replace whole words only to avoid partial replacements
        expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), value);
      }

      // Parse and evaluate the expression safely
      return this._parseExpression(expression);
    } catch (err) {
      console.error('Fabricate v2 | Formula evaluation error:', err);
      return 0;
    }
  }

  /**
   * Parse and evaluate a mathematical expression safely
   * Supports: +, -, *, /, (), dice notation (1d6), Math.floor, Math.ceil, Math.round
   * @private
   */
  static _parseExpression(expr) {
    // Remove whitespace
    expr = expr.replace(/\s+/g, '');

    // Handle dice notation (e.g., "1d6", "2d8")
    expr = expr.replace(/(\d+)d(\d+)/gi, (match, count, sides) => {
      return this._rollDice(parseInt(count), parseInt(sides));
    });

    // Handle Math functions (floor, ceil, round)
    expr = expr.replace(/Math\.(floor|ceil|round)\(([^)]+)\)/g, (match, func, inner) => {
      const value = this._parseExpression(inner);
      return Math[func](value);
    });

    // Evaluate the expression using a safe parser
    return this._evaluateMath(expr);
  }

  /**
   * Roll dice
   * @private
   */
  static _rollDice(count, sides) {
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
  }

  /**
   * Safely evaluate a mathematical expression
   * Uses operator precedence parsing (Shunting Yard algorithm)
   * @private
   */
  static _evaluateMath(expr) {
    // Tokenize
    const tokens = this._tokenize(expr);

    // Convert to postfix notation (Reverse Polish Notation)
    const postfix = this._toPostfix(tokens);

    // Evaluate postfix expression
    return this._evaluatePostfix(postfix);
  }

  /**
   * Tokenize an expression
   * @private
   */
  static _tokenize(expr) {
    const tokens = [];
    let i = 0;

    while (i < expr.length) {
      const char = expr[i];

      // Numbers (including decimals)
      if (/\d/.test(char) || (char === '.' && /\d/.test(expr[i + 1]))) {
        let num = '';
        while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === '.')) {
          num += expr[i];
          i++;
        }
        tokens.push(parseFloat(num));
        continue;
      }

      // Operators and parentheses
      if (['+', '-', '*', '/', '(', ')'].includes(char)) {
        tokens.push(char);
        i++;
        continue;
      }

      // Skip unknown characters
      i++;
    }

    return tokens;
  }

  /**
   * Convert infix notation to postfix (Shunting Yard algorithm)
   * @private
   */
  static _toPostfix(tokens) {
    const output = [];
    const operators = [];
    const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };

    for (const token of tokens) {
      if (typeof token === 'number') {
        output.push(token);
      } else if (token === '(') {
        operators.push(token);
      } else if (token === ')') {
        while (operators.length > 0 && operators[operators.length - 1] !== '(') {
          output.push(operators.pop());
        }
        operators.pop(); // Remove '('
      } else if (['+', '-', '*', '/'].includes(token)) {
        while (
          operators.length > 0 &&
          operators[operators.length - 1] !== '(' &&
          precedence[operators[operators.length - 1]] >= precedence[token]
        ) {
          output.push(operators.pop());
        }
        operators.push(token);
      }
    }

    while (operators.length > 0) {
      output.push(operators.pop());
    }

    return output;
  }

  /**
   * Evaluate a postfix expression
   * @private
   */
  static _evaluatePostfix(postfix) {
    const stack = [];

    for (const token of postfix) {
      if (typeof token === 'number') {
        stack.push(token);
      } else {
        const b = stack.pop();
        const a = stack.pop();

        switch (token) {
          case '+':
            stack.push(a + b);
            break;
          case '-':
            stack.push(a - b);
            break;
          case '*':
            stack.push(a * b);
            break;
          case '/':
            stack.push(a / b);
            break;
        }
      }
    }

    return stack[0] || 0;
  }
}
