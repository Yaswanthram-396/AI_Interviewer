import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { StepIndicator } from './StepIndicator';
import { PersonalDetails, PersonalDetailsRef } from '../../components/steps/PersonalDetails';
import { Qualification, QualificationRef } from '../../components/steps/Qualification';
import { About, AboutRef } from '../../components/steps/About';
import { References, ReferencesRef } from '../../components/steps/References';
import { Identification } from '../../components/steps/Identification';
import { createUserOnboarding } from '../../services/usersapi';
import { useRbac } from '../../context'; // Import the RBAC context to get user info
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

// Define the IOnboardingData interface
interface IOnboardingData {
  updatedDateTime: string;
  personalDetails: {
    fullName: string;
    email: string;
    role: string;
    phone: string;
    wtspNum: string;
    gender: string;
    dob: string;
    applyFor: string;
    currBuildingNo: string;
    currStreet: string;
    currArea: string;
    currCity: string;
    currState: string;
    currPin: string;
    permBuildingNo: string;
    permStreet: string;
    permArea: string;
    permCity: string;
    permState: string;
    permPin: string;
    languages: string[];
  };
  qualification: {
    highestQualification: string;
    workExperience: Array<{
      CompanyName: string;
      ExperienceYears: string;
    }>;
  };
  about: {
    questions: Array<{
      question: string;
      answer: string;
    }>;
  };
  familyMembers: {
    [key: string]: {
      name: string;
      age: string;
      relationship: string;
      organization: string;
      dependentOnYou: string;
    };
  };
  newIdentityProof: {
    aadharFront: string;
    aadharBack: string;
    aadharNumber: string;
    panFront: string;
    panBack: string;
    panNumber: string;
    emergencyNumber: string;
    photo: string;
  };
  references: {
    [key: string]: {
      name: string;
      designation: string;
      organization: string;
      email: string;
      phone: string;
      connection: string;
    };
  };
}

export interface FormData {
  personalDetails: {
    fullName: string;
    dateOfBirth: string;
    gender: string;
    phoneNumber: string;
    whatsappNumber: string;
    email: string;
    currentAddress: {
      buildingFlat: string;
      street: string;
      areaVillage: string;
      cityTownBlock: string;
      state: string;
      pincode: string;
    };
    permanentAddress: {
      buildingFlat: string;
      street: string;
      areaVillage: string;
      cityTownBlock: string;
      state: string;
      pincode: string;
    };
    languages: string[];
  applyFor: string;
  spokenLanguages: string[];
  };
  qualification: {
    highestQualification: string;
    workExperience: Array<{
      company: string;
      experienceYears: string;
    }>;
  };
  about: {
    tellAboutYourself: string;
    whyJoinHR: string;
    howContribute: string;
    hoursContribute: string;
    categories: string[];
    availability: string;
  };
  references: Array<{
    name: string;
    contactNumber: string;
    email: string;
    organization: string;
    designation: string;
    howTheyKnow: string;
  }>;
  identification: {
    profilePhoto?: string;
    aadharFront?: string;
    aadharBack?: string;
    panFront?: string;
    panBack?: string;
    aadharNumber: string;
    panNumber: string;
    emergencyContact: string;
    familyMembers: Array<{
      name: string;
      relationship: string;
      occupation: string;
      age: string;
      dependent: boolean;
    }>;
  };
}

const steps = [
  { id: 1, title: 'Personal Details', component: PersonalDetails },
  { id: 2, title: 'Qualification/Certification', component: Qualification },
  { id: 3, title: 'About', component: About },
  { id: 4, title: 'References', component: References },
  { id: 5, title: 'Identification', component: Identification },
];

interface MultiStepFormProps {
  onFormSubmit?: () => void;
  isCompact?: boolean; // New prop to control layout
}

export const MultiStepForm: React.FC<MultiStepFormProps> = ({ onFormSubmit, isCompact = false }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(() => {
    try {
      const savedStep = localStorage.getItem('multiStepFormCurrentStep');
      if (savedStep) {
        const step = parseInt(savedStep, 10);
        if (!isNaN(step)) {
          return step;
        }
      }
    } catch (error) {
      console.error("Failed to parse current step from local storage", error);
    }
    return 1;
  });
  const personalDetailsRef = useRef<PersonalDetailsRef>(null);
  const qualificationRef = useRef<QualificationRef>(null);
  const aboutRef = useRef<AboutRef>(null);
  const referencesRef = useRef<ReferencesRef>(null);
  
  const [formData, setFormData] = useState<FormData>(() => {
    try {
      const savedData = localStorage.getItem('multiStepFormData');
      if (savedData) {
        return JSON.parse(savedData);
      }
    } catch (error) {
      console.error("Failed to parse form data from local storage", error);
    }
    return {
      personalDetails: {
        fullName: '',
        dateOfBirth: '',
        gender: '',
        phoneNumber: '',
        whatsappNumber: '',
        email: '',
        currentAddress: {
          buildingFlat: '',
          street: '',
          areaVillage: '',
          cityTownBlock: '',
          state: '',
          pincode: '',
        },
        permanentAddress: {
          buildingFlat: '',
          street: '',
          areaVillage: '',
          cityTownBlock: '',
          state: '',
          pincode: '',
        },
        languages: [],
        spokenLanguages: [],
        applyFor: '',
      },
      qualification: {
        highestQualification: '',
        workExperience: [],
      },
      about: {
        tellAboutYourself: '',
        whyJoinHR: '',
        howContribute: '',
        hoursContribute: '',
        categories: [],
        availability: '',
      },
      references: [
        {
          name: '',
          contactNumber: '',
          email: '',
          organization: '',
          designation: '',
          howTheyKnow: '',
        },
      ],
      identification: {
        aadharNumber: '',
        panNumber: '',
        emergencyContact: '',
        familyMembers: [],
      },
    };
  });

  useEffect(() => {
    localStorage.setItem('multiStepFormData', JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    localStorage.setItem('multiStepFormCurrentStep', currentStep.toString());
  }, [currentStep]);

  const updateFormData = (stepData: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...stepData }));
  };

  const nextStep = () => {
    // Validate current step before proceeding
    let isValid = true;
    
    if (currentStep === 1) {
      // Validate Personal Details
      if (personalDetailsRef.current) {
        isValid = personalDetailsRef.current.validateForm();
      }
    } else if (currentStep === 2) {
      // Validate Qualification step
      if (qualificationRef.current) {
        isValid = qualificationRef.current.validateForm();
      }
    } else if (currentStep === 3) {
      // Validate About step
      if (aboutRef.current) {
        isValid = aboutRef.current.validateForm();
      }
    } else if (currentStep === 4) {
      // Validate References step
      if (referencesRef.current) {
        isValid = referencesRef.current.validateForm();
      }
    }
    
    if (isValid && currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else if (!isValid) {
      // Scroll to top to show validation errors
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Add useRbac hook
  const { user } = useRbac();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update the handleSubmit function
  const handleSubmit = async () => {
    let isValid = true;
    const validationErrors = [];

    // 1. Validate Personal Details
    if (personalDetailsRef.current) {
      if (!personalDetailsRef.current.validateForm()) {
        validationErrors.push('Personal Details section is incomplete');
        isValid = false;
      }
    }

    // 2. Validate Qualification
    if (qualificationRef.current) {
      if (!qualificationRef.current.validateForm()) {
        validationErrors.push('Qualification section is incomplete');
        isValid = false;
      }
    }

    // 3. Validate About
    if (aboutRef.current) {
      if (!aboutRef.current.validateForm()) {
        validationErrors.push('About section is incomplete');
        isValid = false;
      }
    }

    // 4. Validate References
    if (referencesRef.current) {
      if (!referencesRef.current.validateForm()) {
        validationErrors.push('References section is incomplete');
        isValid = false;
      }
    }

    // 5. Validate Family Members
    const familyMembers = formData.identification.familyMembers;
    if (!familyMembers || familyMembers.length < 3) {
      validationErrors.push('Please add at least 3 family members');
      isValid = false;
    } else {
      // Validate first 3 family members thoroughly
      for (let i = 0; i < 3; i++) {
        const member = familyMembers[i];
        if (!member.name || !member.relationship || !member.occupation || !member.age || member.dependent === undefined) {
          validationErrors.push(`Family member ${i + 1} has incomplete information`);
          isValid = false;
        }
      }
    }

    // 6. Validate Identification Documents
    const identification = formData.identification;
    if (!identification.aadharNumber || !identification.panNumber || !identification.emergencyContact) {
      validationErrors.push('Identification details are incomplete');
      isValid = false;
    }

    // If validation failed, show errors and return
    if (!isValid) {
      // Show all validation errors in a single toast
      toast.error(
        <div>
          <strong>Please fix the following errors:</strong>
          <ul className="mt-2 list-disc pl-4">
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>,
        {
          position: "top-center",
          autoClose: 5000,
          style: {
            background: '#FEE2E2',
            color: '#991B1B',
            padding: '16px',
            borderRadius: '8px',
            maxWidth: '400px'
          },
        }
      );
      return;
    }

    // If all validations pass, proceed with form submission
    try {
      setIsSubmitting(true);
      const loadingToast = toast.loading('Submitting your application...', {
        position: "top-center",
      });

      if (!user?.id) {
        toast.error('User ID not found. Please log in again.', {
          position: "top-center",
          autoClose: 3000
        });
        return;
      }

      // Transform form data to match onboarding data structure
      const onboardingData: IOnboardingData = {
        updatedDateTime: new Date().toISOString(),
        personalDetails: {
          fullName: formData.personalDetails.fullName,
          email: formData.personalDetails.email,
          role: user.role,
          phone: formData.personalDetails.phoneNumber,
          wtspNum: formData.personalDetails.whatsappNumber,
          gender: formData.personalDetails.gender,
          dob: formData.personalDetails.dateOfBirth,
          applyFor: "hm",
          currBuildingNo: formData.personalDetails.currentAddress.buildingFlat,
          currStreet: formData.personalDetails.currentAddress.street,
          currArea: formData.personalDetails.currentAddress.areaVillage,
          currCity: formData.personalDetails.currentAddress.cityTownBlock,
          currState: formData.personalDetails.currentAddress.state,
          currPin: formData.personalDetails.currentAddress.pincode,
          permBuildingNo: formData.personalDetails.permanentAddress.buildingFlat,
          permStreet: formData.personalDetails.permanentAddress.street,
          permArea: formData.personalDetails.permanentAddress.areaVillage,
          permCity: formData.personalDetails.permanentAddress.cityTownBlock,
          permState: formData.personalDetails.permanentAddress.state,
          permPin: formData.personalDetails.permanentAddress.pincode,
          languages: formData.personalDetails.languages,
        },
        qualification: {
          highestQualification: formData.qualification.highestQualification,
          workExperience: formData.qualification.workExperience.map(exp => ({
            CompanyName: exp.company,
            ExperienceYears: exp.experienceYears
          }))
        },
        about: {
          questions: [
            {
              question: "Tell about yourself",
              answer: formData.about.tellAboutYourself
            },
            {
              question: "Why do you want to join HR?",
              answer: formData.about.whyJoinHR
            },
            {
              question: "How will you contribute?",
              answer: formData.about.howContribute
            },
            {
              question: "How many hours can you contribute?",
              answer: formData.about.hoursContribute
            },
        
          ]
        },
        familyMembers: formData.identification.familyMembers.reduce((acc, member, index) => ({
          ...acc,
          [`member${index + 1}`]: {
            name: member.name,
            age: member.age,
            relationship: member.relationship,
            organization: member.occupation,
            dependentOnYou: member.dependent ? "yes" : "no"
          }
        }), {}),
        newIdentityProof: {
          aadharFront: "https://media.istockphoto.com/id/517188688/photo/mountain-landscape.jpg" ,
          aadharBack: "https://media.istockphoto.com/id/517188688/photo/mountain-landscape.jpg" ,
          aadharNumber: formData.identification.aadharNumber,
          panFront: "https://media.istockphoto.com/id/517188688/photo/mountain-landscape.jpg" ,
          panBack: "https://media.istockphoto.com/id/517188688/photo/mountain-landscape.jpg" ,
          panNumber: formData.identification.panNumber,
          emergencyNumber: formData.identification.emergencyContact,
          photo: "https://media.istockphoto.com/id/517188688/photo/mountain-landscape.jpg" 
        },
        references: formData.references.reduce((acc, ref, index) => ({
          ...acc,
          [`person${index + 1}`]: {
            name: ref.name,
            designation: ref.designation,
            organization: ref.organization,
            email: ref.email,
            phone: ref.contactNumber,
            connection: ref.howTheyKnow
          }
        }), {})
      };

      // Call the onboarding API
      await createUserOnboarding(user.id, onboardingData);

      // Clear local storage after successful submission
      localStorage.removeItem('multiStepFormData');
      localStorage.removeItem('multiStepFormCurrentStep');

      // Dismiss loading toast and show success
      toast.dismiss(loadingToast);
      toast.success('✅ Application submitted successfully!', {
        position: "top-center",
        autoClose: 1000, // Reduced to 1 second
        style: {
          background: '#10B981',
          color: 'white',
          padding: '16px',
          borderRadius: '8px',
        },
      });

      // Call the onFormSubmit callback if provided
      if (onFormSubmit) {
        onFormSubmit();
      }

      // Use window.location for full page reload and navigation
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1500); // Wait for 1.5 seconds to show the success message

    } catch (error) {
      console.error('Failed to submit form:', error);
      toast.error('❌ Failed to submit application. Please try again.', {
        position: "top-center",
      autoClose: 5000,
        style: {
          background: '#EF4444',
          color: 'white',
          padding: '16px',
          borderRadius: '8px',
        },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentStepData = steps.find(step => step.id === currentStep);
  const StepComponent = currentStepData?.component;

  return (
    <div className={isCompact ? "w-full" : "min-h-screen bg-gray-50 py-4 px-2 sm:px-4 lg:px-8"}>
      <div className="w-full max-w-none mx-auto">
        <StepIndicator currentStep={currentStep} totalSteps={steps.length} steps={steps} />
        
        <Card className="shadow-lg border border-gray-200 w-full bg-white">
          <CardContent className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-orange-600 mb-2">
                {currentStepData?.title}
              </h2>
              {/* <p className="text-sm text-red-500 mb-4">
                <span className="text-red-500">(*)</span> Indicates required field
              </p> */}
            </div>

            <div className="w-full">
              {currentStep === 1 ? (
                <PersonalDetails
                  ref={personalDetailsRef}
                  formData={formData}
                  updateFormData={updateFormData}
                />
              ) : currentStep === 2 ? (
                <Qualification
                  ref={qualificationRef}
                  formData={formData}
                  updateFormData={updateFormData}
                />
              ) : currentStep === 3 ? (
                <About
                  ref={aboutRef}
                  formData={formData}
                  updateFormData={updateFormData}
                />
              ) : currentStep === 4 ? (
                <References
                  ref={referencesRef}
                  formData={formData}
                  updateFormData={updateFormData}
                />
              ) : StepComponent ? (
                <StepComponent
                  formData={formData}
                  updateFormData={updateFormData}
                />
              ) : null}
            </div>

            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-8 pt-6 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={currentStep === 1}
                className="px-6 py-2 w-full sm:w-auto order-2 sm:order-1"
              >
                Back
              </Button>

              {currentStep === steps.length ? (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white w-full sm:w-auto order-1 sm:order-2 relative"
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      <span>Submitting...</span>
                    </div>
                  ) : (
                    'Submit Application'
                  )}
                </Button>
              ) : (
                <Button
                  onClick={nextStep}
                  className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white w-full sm:w-auto order-1 sm:order-2"
                >
                  Save & Next
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};