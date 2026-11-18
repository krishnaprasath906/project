from flask import Blueprint, jsonify
from backend.services.prediction_service import generate_prediction

prediction_bp = Blueprint('prediction', __name__, url_prefix='/api/prediction')

@prediction_bp.route('', methods=['GET'])
def get_prediction():
    result = generate_prediction()
    return jsonify({
        'success': True,
        'prediction': result
    })
