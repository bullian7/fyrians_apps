from flask import Blueprint, render_template

listmaker_bp = Blueprint('listmaker_bp', __name__)


@listmaker_bp.route('/listmaker')
def listmaker():
    return render_template('listmaker.html')
