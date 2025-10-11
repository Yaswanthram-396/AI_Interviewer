import React, { useState, useRef, useEffect } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Clock } from 'lucide-react';
import { cn } from '../lib/utils';

interface TimePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  className?: string;
  format?: '12' | '24';
}

const TimePicker: React.FC<TimePickerProps> = ({
  value = '',
  onChange,
  placeholder = 'Select time',
  disabled = false,
  error = false,
  className,
  format = '24'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState<string>('01');
  const [selectedMinute, setSelectedMinute] = useState<string>('05');
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('AM');

  // Initialize from value
  useEffect(() => {
    if (value) {
      const [hours, minutes] = value.split(':');
      const hour24 = parseInt(hours);
      const period = hour24 >= 12 ? 'PM' : 'AM';
      const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
      setSelectedHour(hour12.toString().padStart(2, '0'));
      setSelectedMinute(minutes);
      setSelectedPeriod(period);
    }
  }, [value, format]);

  const formatDisplayTime = () => {
    if (!value) return '';
    const [hours, minutes] = value.split(':');
    const hour24 = parseInt(hours);
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    return `${hour12.toString().padStart(2, '0')}:${minutes} ${period}`;
  };

  const handleTimeSelect = () => {
    const hour12 = parseInt(selectedHour);
    let hour24: number;
    
    if (selectedPeriod === 'PM' && hour12 !== 12) {
      hour24 = hour12 + 12;
    } else if (selectedPeriod === 'AM' && hour12 === 12) {
      hour24 = 0;
    } else {
      hour24 = hour12;
    }
    
    const timeValue = `${hour24.toString().padStart(2, '0')}:${selectedMinute}`;
    onChange?.(timeValue);
    setIsOpen(false);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow free input, user can type whatever they want
    setSelectedHour(value);
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow free input, user can type whatever they want
    setSelectedMinute(value);
  };

  const handleHourBlur = () => {
    // Format hour when user finishes editing
    let hour = selectedHour.replace(/\D/g, '');
    if (hour === '' || parseInt(hour) === 0) {
      hour = '01';
    } else if (parseInt(hour) > 12) {
      hour = '12';
    }
    setSelectedHour(hour.padStart(2, '0'));
  };

  const handleMinuteBlur = () => {
    // Format minute when user finishes editing
    let minute = selectedMinute.replace(/\D/g, '');
    if (minute === '') {
      minute = '00';
    } else if (parseInt(minute) > 59) {
      minute = '59';
    }
    setSelectedMinute(minute.padStart(2, '0'));
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-12 px-3" ,
            !value && "text-muted-foreground",
            error && "border-red-300 focus:ring-red-500 focus:border-red-500 bg-red-50",
            className
          )} style={{ borderRadius: '12px' }}
          disabled={disabled}
        >
          <Clock className="mr-2 h-4 w-4" />
          {formatDisplayTime() || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="bg-gray-50 p-6 rounded-lg border" style={{ borderRadius: '12px' }}>
          {/* Header */}
        

          {/* Time Input Section */}
          <div className="flex items-center justify-center gap-4 mb-6">
            {/* Hour Input */}
            <div className="text-center">
              <input
                type="text"
                value={selectedHour}
                onChange={handleHourChange}
                onBlur={handleHourBlur}
                className="w-20 h-20 text-3xl font-bold text-center bg-blue-100 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-500 text-blue-800 placeholder-blue-400"
                placeholder="01"
                onFocus={(e) => e.target.select()}
              />
              <p className="text-xs text-gray-600 mt-2">Hour</p>
            </div>

            {/* Colon Separator */}
            <div className="text-3xl font-bold text-gray-600 px-1 mb-6">:</div>

            {/* Minute Input */}
            <div className="text-center">
              <input
                type="text"
                value={selectedMinute}
                onChange={handleMinuteChange}
                onBlur={handleMinuteBlur}
                className="w-20 h-20 text-3xl font-bold text-center bg-white border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-gray-800 placeholder-gray-400"
                placeholder="05"
                onFocus={(e) => e.target.select()}
              />
              <p className="text-xs text-gray-600 mt-2">Minute</p>
            </div>

            {/* AM/PM Toggle */}
            <div className="ml-4 flex flex-col gap-2 mb-6">
              <button
                type="button"
                onClick={() => setSelectedPeriod('AM')}
                className={cn(
                  "px-4 py-3 text-sm font-medium rounded-lg transition-colors min-w-[56px]",
                  selectedPeriod === 'AM'
                    ? "bg-pink-200 text-pink-800 border-2 border-pink-400"
                    : "bg-gray-200 text-gray-600 border-2 border-gray-300 hover:bg-gray-300"
                )}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setSelectedPeriod('PM')}
                className={cn(
                  "px-4 py-3 text-sm font-medium rounded-lg transition-colors min-w-[56px]",
                  selectedPeriod === 'PM'
                    ? "bg-pink-200 text-pink-800 border-2 border-pink-400"
                    : "bg-gray-200 text-gray-600 border-2 border-gray-300 hover:bg-gray-300"
                )}
              >
                PM
              </button>
            </div>
          </div>

    

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3">
            <Button
              variant="ghost"
              onClick={() => setIsOpen(false)}
              className="text-purple-600 hover:text-purple-800 hover:bg-purple-50"
            >
              Cancel
            </Button>
            <Button
              onClick={handleTimeSelect}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6"
            >
              OK
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TimePicker;
