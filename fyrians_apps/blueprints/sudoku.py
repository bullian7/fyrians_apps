from flask import Blueprint, render_template

sudoku_bp = Blueprint('sudoku_bp', __name__)


@sudoku_bp.route('/sudoku')
def sudoku():
    return render_template('sudoku.html')
