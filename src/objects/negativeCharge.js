import { DynamicCharge } from './DynamicCharge.js';
import { registerType } from '../ObjectRegistry.js';

export class negativeCharge extends DynamicCharge {
    static id = 'negativeCharge';
    static label = 'Negative Charge';
    static ghostColor = 0x0000ff;
    static modelUrl = './src/models/negativeCharge.glb';
    static chargeType = 'negative';
    static scale = 0.5;
}
registerType(negativeCharge);
