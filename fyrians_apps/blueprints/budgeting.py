from flask import Blueprint, render_template

budgeting_bp = Blueprint('budgeting_bp', __name__)


@budgeting_bp.route('/budgeting')
def budgeting():
    return render_template('budgeting.html')
