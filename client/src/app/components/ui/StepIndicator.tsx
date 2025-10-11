import React from 'react';
import { Check } from 'lucide-react';

interface Step {
  id: number;
  title: string;
}

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  steps: Step[];
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  steps,
}) => {
  return (
    <div className="mb-8 bg-white rounded-lg shadow-sm border p-6">
      {/* Desktop Version */}
      <div className="hidden md:block">
        {/* Steps Row */}
        <div className="flex items-center justify-between relative">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              {/* Step Container */}
              <div className="flex flex-col items-center z-10 relative bg-white">
                {/* Step Circle */}
                <div
                  className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-300 shadow-sm ${
                    step.id < currentStep
                      ? 'bg-green-500 border-green-500 text-white shadow-green-200'
                      : step.id === currentStep
                      ? 'bg-orange-500 border-orange-500 text-white shadow-orange-200'
                      : 'bg-white border-gray-300 text-gray-500'
                  }`}
                >
                  {step.id < currentStep ? (
                    <Check className="w-6 h-6" />
                  ) : (
                    <span className="text-sm font-bold">{step.id}</span>
                  )}
                </div>
                
                {/* Step Title */}
                <div className="mt-4 text-center px-2">
                  <span
                    className={`text-sm font-medium transition-colors duration-300 ${
                      step.id <= currentStep ? 'text-gray-900' : 'text-gray-500'
                    }`}
                  >
                    {step.title}
                  </span>
                </div>
              </div>

              {/* Connection Line between steps */}
              {index < steps.length - 1 && (
                <div className="flex-1 px-4">
                  <div
                    className={`h-1 rounded transition-all duration-300 mb-5 ${
                      step.id < currentStep ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Mobile Version */}
      <div className="md:hidden">
        <div className="flex items-center justify-center space-x-2 mb-4">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                  step.id < currentStep
                    ? 'bg-green-500 border-green-500 text-white'
                    : step.id === currentStep
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'bg-white border-gray-300 text-gray-500'
                }`}
              >
                {step.id < currentStep ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span className="text-xs font-bold">{step.id}</span>
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-0.5 w-6 transition-all duration-300 ${
                    step.id < currentStep ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
        
        {/* Current Step Title for Mobile */}
        <div className="text-center">
          <span className="text-sm font-medium text-gray-900">
            Step {currentStep} of {steps.length}: {steps.find(s => s.id === currentStep)?.title}
          </span>
        </div>
      </div>
    </div>
  );
};